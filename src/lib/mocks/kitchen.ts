// Mock data for /mocks/kitchen.

export type KitchenRecipeMock = {
  id: string;
  title: string;
  adaptedNote?: string;
  updatedLabel: string;
  shared: boolean;
};

export const kitchenMock: {
  userName: string;
  allergies: string[];
  recipes: KitchenRecipeMock[];
} = {
  userName: "David",
  allergies: ["dairy"],
  recipes: [
    {
      id: "butter-chicken",
      title: "Easy Butter Chicken",
      adaptedNote: "Adapted: dairy-free",
      updatedLabel: "Updated 2h ago",
      shared: true,
    },
    {
      id: "spinach-dal",
      title: "Spinach Dal",
      updatedLabel: "Updated yesterday",
      shared: false,
    },
    {
      id: "cacio-e-pepe",
      title: "Weeknight Cacio e Pepe",
      adaptedNote: "Adapted: no oven",
      updatedLabel: "Updated 3 days ago",
      shared: false,
    },
    {
      id: "shakshuka",
      title: "Shakshuka",
      updatedLabel: "Updated last week",
      shared: false,
    },
  ],
};
