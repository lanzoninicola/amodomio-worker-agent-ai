type KnowledgePayload = {
  instructions?: { content?: string; version?: number } | null;
  deterministicResponses?: Array<{
    id: string;
    trigger: string;
    isRegex: boolean;
    response: string;
    priority: number;
    activeFrom?: string | null;
    activeTo?: string | null;
  }>;
  structured?: {
    storeOpening?: {
      status?: { isOpen?: boolean; reason?: string };
      override?: string;
      schedule?: Array<Record<string, unknown>>;
    };
    locations?: Array<Record<string, unknown>>;
    deliveryZones?: Array<Record<string, unknown>>;
    publicLinks?: { menu?: string | null; order?: string | null };
    featured?: Array<{
      id: string;
      title: string;
      subtitle?: string | null;
      promotionHintText?: string | null;
      images?: Array<{
        alt?: string | null;
        linkUrl?: string | null;
        linkText?: string | null;
        chipModalTitle?: string | null;
        chipModalBody?: string | null;
      }>;
    }>;
    cardapio?: { items?: Array<Record<string, any>> };
  };
};

type KnowledgeResponse = { ok?: boolean; knowledge?: KnowledgePayload };

const CACHE_TTL_MS = 60_000;
const MAX_CONTEXT_CHARS = 30_000;
let cache: { expiresAt: number; value: KnowledgePayload } | null = null;

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function queryTokens(query: string) {
  return normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function includesAny(query: string, terms: string[]) {
  const normalized = normalize(query);
  return terms.some((term) => normalized.includes(term));
}

function itemSearchText(row: Record<string, any>) {
  const item = row.Item ?? {};
  const selling = item.ItemSellingInfo ?? {};
  return normalize(
    [
      item.name,
      item.description,
      selling.baseIngredients,
      selling.ingredients,
      selling.longDescription,
      selling.notesPublic,
      selling.Category?.name,
      selling.ItemGroup?.name,
    ].join(" "),
  );
}

function formatMenuItem(row: Record<string, any>) {
  const item = row.Item ?? {};
  const selling = item.ItemSellingInfo ?? {};
  const variations = Array.isArray(item.ItemVariation)
    ? item.ItemVariation.map((variation: Record<string, any>) => {
        const name = variation.Variation?.name ?? variation.Variation?.code;
        const price = variation.ItemSellingPriceVariation?.[0]?.priceAmount;
        return price == null ? name : `${name}: R$ ${Number(price).toFixed(2)}`;
      }).filter(Boolean)
    : [];
  const description =
    selling.longDescription ||
    selling.ingredients ||
    selling.baseIngredients ||
    item.description ||
    "";
  return `- ${item.name}${description ? ` — ${description}` : ""}${variations.length ? ` | ${variations.join("; ")}` : ""}`;
}

function variationDetails(variation: Record<string, any>) {
  return Object.fromEntries(
    (variation.VariationDetail ?? []).map((detail: Record<string, any>) => [
      detail.key,
      detail.value,
    ]),
  );
}

function formatSizeVariations(items: Array<Record<string, any>>) {
  const sizes = new Map<string, Record<string, any>>();
  for (const row of items) {
    for (const itemVariation of row.Item?.ItemVariation ?? []) {
      const variation = itemVariation.Variation;
      if (variation?.kind === "size" && !sizes.has(variation.code)) {
        sizes.set(variation.code, variation);
      }
    }
  }

  return [...sizes.values()]
    .map((variation) => {
      const details = variationDetails(variation);
      const facts = [
        details.maxServeAmount != null
          ? `serve no máximo ${details.maxServeAmount} pessoa(s)`
          : null,
        details.serveDescription ? String(details.serveDescription) : null,
        details.maxFlavorsAmount != null
          ? `aceita no máximo ${details.maxFlavorsAmount} sabor(es)`
          : null,
        details.flavorsDescription ? String(details.flavorsDescription) : null,
        variation.additionalInformation,
      ].filter(Boolean);
      return `- ${variation.name}${facts.length ? `: ${facts.join("; ")}` : ": capacidade ainda não cadastrada"}`;
    })
    .join("\n");
}

function formatFeatured(
  featured: NonNullable<KnowledgePayload["structured"]>["featured"],
) {
  return (featured ?? [])
    .map((entry) => {
      const mediaDetails = (entry.images ?? [])
        .flatMap((media) => [
          media.alt,
          media.linkText,
          media.chipModalTitle,
          media.chipModalBody,
        ])
        .filter(Boolean);
      const details = [
        entry.subtitle,
        entry.promotionHintText,
        ...mediaDetails,
      ].filter(Boolean);
      const link = entry.images?.find((media) => media.linkUrl)?.linkUrl;
      return `- ${entry.title}${details.length ? ` — ${details.join("; ")}` : ""}${link ? ` | Link: ${link}` : ""}`;
    })
    .join("\n");
}

export function formatKnowledgeContext(
  knowledge: KnowledgePayload,
  inboundText: string,
) {
  const sections: string[] = [];
  const instructions = knowledge.instructions?.content?.trim();
  if (instructions) {
    sections.push(`INSTRUCOES OFICIAIS DA EMPRESA:\n${instructions}`);
  }

  const structured = knowledge.structured ?? {};
  const opening = structured.storeOpening;
  if (opening) {
    sections.push(
      `STATUS E HORARIOS:\nLoja agora: ${opening.status?.isOpen ? "aberta" : "fechada"}. Override: ${opening.override ?? "auto"}. Agenda: ${JSON.stringify(opening.schedule ?? [])}`,
    );
  }

  if (structured.locations?.length) {
    sections.push(
      `UNIDADES:\n${structured.locations
        .map(
          (location) =>
            `- ${location.name}: ${location.address}, ${location.city}/${location.state}. Telefone: ${location.phoneNumber ?? "nao informado"}`,
        )
        .join("\n")}`,
    );
  }

  const wantsDelivery = includesAny(inboundText, [
    "entrega",
    "bairro",
    "taxa",
    "delivery",
    "distancia",
    "demora",
    "cep",
  ]);
  if (wantsDelivery && structured.deliveryZones?.length) {
    sections.push(
      `AREAS DE ENTREGA:\n${structured.deliveryZones
        .map((zone) => {
          const fee = Array.isArray(zone.deliveryFees)
            ? zone.deliveryFees[0]?.amount
            : undefined;
          const distance = Array.isArray(zone.distances)
            ? zone.distances[0]
            : undefined;
          return `- ${zone.name}, ${zone.city}/${zone.state}: taxa ${fee == null ? "nao informada" : `R$ ${Number(fee).toFixed(2)}`}${distance?.estimatedTimeInMin ? `, estimativa ${distance.estimatedTimeInMin} min` : ""}`;
        })
        .join("\n")}`,
    );
  }

  const allItems = structured.cardapio?.items ?? [];
  const wantsRecommendation = includesAny(inboundText, [
    "recomenda",
    "recomendacao",
    "indica",
    "sugere",
    "sugestao",
    "qual pizza",
    "qual sabor",
    "parecida com",
  ]);
  if (wantsRecommendation) {
    const featured = formatFeatured(structured.featured);
    sections.push(
      featured
        ? `DESTAQUES OFICIAIS PARA RECOMENDACAO:\n${featured}`
        : "DESTAQUES OFICIAIS PARA RECOMENDACAO:\nNenhum destaque publicado no momento.",
    );
  }
  const wantsSizeGuidance = includesAny(inboundText, [
    "tamanho",
    "pessoa",
    "pessoas",
    "serve",
    "suficiente",
    "quantos sabores",
    "sabores permite",
  ]);
  if (wantsSizeGuidance) {
    const sizes = formatSizeVariations(allItems);
    if (sizes) sections.push(`CAPACIDADE DOS TAMANHOS:\n${sizes}`);
  }
  const wantsFullMenu = includesAny(inboundText, [
    "cardapio",
    "menu",
    "sabores",
    "opcoes",
    "pizzas",
    "precos",
  ]);
  const tokens = queryTokens(inboundText);
  const matchedItems = wantsFullMenu
    ? allItems
    : allItems.filter((item) => {
        const searchable = itemSearchText(item);
        return tokens.some((token) => searchable.includes(token));
      });
  if (matchedItems.length) {
    sections.push(
      `CARDAPIO PUBLICADO:\n${matchedItems.map(formatMenuItem).join("\n")}`,
    );
  }

  sections.push(
    "REGRAS DE USO: trate estes dados como fonte oficial atual. Nao invente informacoes ausentes. Em perguntas sobre tamanho, use somente CAPACIDADE DOS TAMANHOS; se a capacidade estiver sem cadastro, diga que precisa confirmar com a equipe. Em pedidos de recomendacao, recomende somente itens de DESTAQUES OFICIAIS PARA RECOMENDACAO. Se nenhum destaque corresponder ao gosto informado, diga isso claramente em vez de recomendar outro item do cardapio.",
  );
  return sections.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
}

export function findDeterministicResponse(
  knowledge: KnowledgePayload,
  inboundText: string,
  now = new Date(),
) {
  const normalizedText = normalize(inboundText);
  const company = knowledge.structured?.locations?.[0];
  const values: Record<string, unknown> = {
    "company.name": company?.name,
    "company.address": company?.address,
    "company.city": company?.city,
    "company.state": company?.state,
    "company.phone": company?.phoneNumber,
    "links.menu": knowledge.structured?.publicLinks?.menu,
    "links.order": knowledge.structured?.publicLinks?.order,
  };

  const render = (template: string) => {
    let hasMissingValue = false;
    const response = template.replace(
      /\{\{\s*([\w.]+)\s*\}\}/g,
      (_, key: string) => {
        const value = values[key];
        if (typeof value !== "string" || !value.trim()) {
          hasMissingValue = true;
          return `{{${key}}}`;
        }
        return value;
      },
    );
    return hasMissingValue ? null : response.trim();
  };

  for (const rule of knowledge.deterministicResponses ?? []) {
    if (rule.activeFrom && now < new Date(rule.activeFrom)) continue;
    if (rule.activeTo && now > new Date(rule.activeTo)) continue;
    if (!rule.trigger?.trim() || !rule.response?.trim()) continue;

    if (rule.isRegex) {
      try {
        if (new RegExp(rule.trigger, "iu").test(inboundText)) {
          return render(rule.response);
        }
      } catch {
        continue;
      }
    } else if (normalizedText.includes(normalize(rule.trigger))) {
      return render(rule.response);
    }
  }
  return null;
}

export async function loadKnowledgeContext(params: {
  baseUrl: string;
  apiKey: string;
  inboundText: string;
}) {
  let knowledge: KnowledgePayload;
  if (cache && cache.expiresAt > Date.now()) {
    knowledge = cache.value;
  } else {
    const response = await fetch(
      `${params.baseUrl.replace(/\/$/, "")}/api/ai/knowledge`,
      {
        headers: { "x-api-key": params.apiKey },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = (await response
      .json()
      .catch(() => ({}))) as KnowledgeResponse;
    if (!response.ok || !payload.ok || !payload.knowledge) {
      throw new Error(`Amodomio knowledge request failed (${response.status})`);
    }
    knowledge = payload.knowledge;
    cache = { value: knowledge, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return {
    context: formatKnowledgeContext(knowledge, params.inboundText),
    deterministicResponse: findDeterministicResponse(
      knowledge,
      params.inboundText,
    ),
  };
}
