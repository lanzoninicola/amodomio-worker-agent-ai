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
                Variation: { name: "Grande" },
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
});

describe("findDeterministicResponse", () => {
  it("uses a managed rule before the AI", () => {
    expect(findDeterministicResponse(knowledge, "Quero o cardápio")).toContain(
      "https://www.amodomio.com.br/cardapio"
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
      "Estamos em Rua Teste, 1, Pato Branco/PR."
    );
  });

  it("returns null when no managed rule matches", () => {
    expect(
      findDeterministicResponse(knowledge, "Quanto custa a calabresa?")
    ).toBeNull();
  });
});
