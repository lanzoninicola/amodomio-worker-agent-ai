import { describe, expect, it } from "vitest";
import {
  findDeterministicResponse,
  formatKnowledgeContext,
} from "./knowledge.js";

const knowledge = {
  instructions: { content: "Seja cordial." },
  deterministicResponses: [
    {
      id: "menu",
      trigger: "cardápio",
      isRegex: false,
      response: "Veja: https://www.amodomio.com.br/cardapio",
      priority: 20,
    },
  ],
  structured: {
    publicLinks: {
      menu: "https://www.amodomio.com.br/cardapio",
      order: "https://amodomio.mandarpedido.com/mobile/home",
    },
    featured: [
      {
        id: "featured-caprese",
        title: "Sabor Caprese com rúcula",
        subtitle: "Leve e aromática",
        images: [{ linkUrl: "/cardapio#caprese", alt: "Pizza Caprese" }],
      },
    ],
    storeOpening: {
      status: { isOpen: true },
      override: "auto",
      schedule: [],
    },
    locations: [
      {
        name: "A Modo Mio",
        address: "Rua Teste, 1",
        city: "Pato Branco",
        state: "PR",
        phoneNumber: "123",
      },
    ],
    deliveryZones: [
      {
        name: "Centro",
        city: "Pato Branco",
        state: "PR",
        deliveryFees: [{ amount: 8 }],
        distances: [{ estimatedTimeInMin: 25 }],
      },
    ],
    cardapio: {
      items: [
        {
          Item: {
            name: "Pizza Calabresa",
            ItemSellingInfo: { ingredients: "Calabresa e cebola" },
            ItemVariation: [
              {
                Variation: {
                  kind: "size",
                  code: "grande",
                  name: "Grande",
                  VariationDetail: [
                    { key: "maxServeAmount", value: 4 },
                    { key: "maxFlavorsAmount", value: 2 },
                  ],
                },
                ItemSellingPriceVariation: [{ priceAmount: 59.9 }],
              },
            ],
          },
        },
      ],
    },
  },
};

describe("formatKnowledgeContext", () => {
  it("selects a matching menu item", () => {
    const context = formatKnowledgeContext(knowledge, "Tem calabresa grande?");
    expect(context).toContain("Pizza Calabresa");
    expect(context).toContain("R$ 59.90");
    expect(context).not.toContain("AREAS DE ENTREGA");
  });

  it("includes delivery zones only for delivery questions", () => {
    const context = formatKnowledgeContext(knowledge, "Entrega no Centro?");
    expect(context).toContain("AREAS DE ENTREGA");
    expect(context).toContain("R$ 8.00");
  });

  it("uses structured variation details for size guidance", () => {
    const context = formatKnowledgeContext(
      knowledge,
      "Qual tamanho serve quatro pessoas?",
    );
    expect(context).toContain("CAPACIDADE DOS TAMANHOS");
    expect(context).toContain("Grande: serve no máximo 4 pessoa(s)");
    expect(context).toContain("aceita no máximo 2 sabor(es)");
  });

  it("uses published cardapio highlights for recommendations", () => {
    const context = formatKnowledgeContext(
      knowledge,
      "Qual pizza você recomenda?",
    );
    expect(context).toContain("DESTAQUES OFICIAIS PARA RECOMENDACAO");
    expect(context).toContain("Sabor Caprese com rúcula");
    expect(context).toContain("recomende somente itens");
  });
});

describe("findDeterministicResponse", () => {
  it("uses a managed rule before the AI", () => {
    expect(findDeterministicResponse(knowledge, "Quero o cardápio")).toContain(
      "https://www.amodomio.com.br/cardapio",
    );
  });

  it("renders managed placeholders from official sources", () => {
    const withTemplate = {
      ...knowledge,
      deterministicResponses: [
        {
          id: "address",
          trigger: "endereço",
          isRegex: false,
          response:
            "Estamos em {{company.address}}, {{company.city}}/{{company.state}}.",
          priority: 50,
        },
      ],
    };
    expect(findDeterministicResponse(withTemplate, "Qual o endereço?")).toBe(
      "Estamos em Rua Teste, 1, Pato Branco/PR.",
    );
  });

  it("returns null when no managed rule matches", () => {
    expect(
      findDeterministicResponse(knowledge, "Quanto custa a calabresa?"),
    ).toBeNull();
  });
});
