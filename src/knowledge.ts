type KnowledgePayload = {
  instructions?: { content?: string; version?: number } | null;
  structured?: {
    storeOpening?: {
      status?: { isOpen?: boolean; reason?: string };
      override?: string;
      schedule?: Array<Record<string, unknown>>;
    };
    locations?: Array<Record<string, unknown>>;
    deliveryZones?: Array<Record<string, unknown>>;
    cardapio?: { items?: Array<Record<string, any>> };
  };
};

type KnowledgeResponse = { ok?: boolean; knowledge?: KnowledgePayload };

const CACHE_TTL_MS = 5 * 60_000;
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
    ].join(" ")
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

export function formatKnowledgeContext(
  knowledge: KnowledgePayload,
  inboundText: string
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
      `STATUS E HORARIOS:\nLoja agora: ${opening.status?.isOpen ? "aberta" : "fechada"}. Override: ${opening.override ?? "auto"}. Agenda: ${JSON.stringify(opening.schedule ?? [])}`
    );
  }

  if (structured.locations?.length) {
    sections.push(
      `UNIDADES:\n${structured.locations
        .map(
          (location) =>
            `- ${location.name}: ${location.address}, ${location.city}/${location.state}. Telefone: ${location.phoneNumber ?? "nao informado"}`
        )
        .join("\n")}`
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
        .join("\n")}`
    );
  }

  const allItems = structured.cardapio?.items ?? [];
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
      `CARDAPIO PUBLICADO:\n${matchedItems.map(formatMenuItem).join("\n")}`
    );
  }

  sections.push(
    "REGRAS DE USO: trate estes dados como fonte oficial atual. Nao invente informacoes ausentes. Se a informacao nao estiver aqui, diga que precisa confirmar com a equipe."
  );
  return sections.join("\n\n").slice(0, MAX_CONTEXT_CHARS);
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
      }
    );
    const payload = (await response.json().catch(() => ({}))) as KnowledgeResponse;
    if (!response.ok || !payload.ok || !payload.knowledge) {
      throw new Error(`Amodomio knowledge request failed (${response.status})`);
    }
    knowledge = payload.knowledge;
    cache = { value: knowledge, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return formatKnowledgeContext(knowledge, params.inboundText);
}
