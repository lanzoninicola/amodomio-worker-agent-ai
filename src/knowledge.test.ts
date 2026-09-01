import { describe, expect, it } from "vitest";
import { formatKnowledgeContext } from "./knowledge.js";

const knowledge = {
  instructions: { content: "Seja cordial." },
  structured: {
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
