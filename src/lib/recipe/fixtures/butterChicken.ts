import type { Recipe } from "../schema";

// Valid butter chicken recipe for tests and UI work. Step text omits quantities on purpose.
export const butterChicken: Recipe = {
  title: "Easy Butter Chicken",
  source: {
    url: "https://www.seriouseats.com/easy-butter-chicken-recipe",
    siteName: "Serious Eats",
  },
  servings: 4,
  times: { totalMin: 55, activeMin: 25 },
  difficulty: {
    score: 2,
    reason: "Mostly simple chopping and one pan, with a 30-minute marinade to plan around.",
  },
  cleanup: {
    score: 3,
    reason: "Uses a sheet pan, a skillet and a blender, plus a bowl for the marinade.",
    dishes: ["sheet pan", "large skillet", "blender", "marinade bowl"],
  },
  ingredients: [
    { id: "i1", qty: 2, unit: "lb", item: "boneless, skinless chicken thighs", note: "cut into 1.5-inch pieces", group: "For the marinade", allergens: [], tips: [] },
    { id: "i2", qty: 1, unit: "cup", item: "plain yogurt", group: "For the marinade", allergens: ["dairy"], tips: [] },
    { id: "i3", qty: 2, unit: "tsp", item: "garam masala", group: "For the marinade", allergens: [], tips: [] },
    { id: "i4", qty: null, unit: null, item: "kosher salt", note: "to taste", group: "For the marinade", allergens: [], tips: [] },
    { id: "i5", qty: 3, unit: "tbsp", item: "butter", note: "unsalted", group: "For the sauce", allergens: ["dairy"], tips: [] },
    { id: "i6", qty: 1, unit: "medium", item: "yellow onion", note: "finely chopped", group: "For the sauce", allergens: [], tips: [] },
    { id: "i7", qty: 1, unit: "tbsp", item: "ginger-garlic paste", group: "For the marinade", allergens: [], tips: [] },
    { id: "i8", qty: 14, unit: "oz", item: "crushed tomatoes", group: "For the sauce", allergens: [], tips: [] },
    { id: "i9", qty: 1, unit: "cup", item: "heavy cream", group: "For the sauce", allergens: ["dairy"], tips: [] },
  ],
  appliances: [
    { id: "a1", name: "Oven", tips: [] },
    { id: "a2", name: "Blender", tips: [] },
    { id: "a3", name: "Large skillet", tips: [] },
  ],
  steps: [
    {
      id: "s1",
      text: "Cut the chicken into 1.5-inch pieces and pat it dry.",
      ingredientIds: ["i1"],
      applianceIds: [],
      estMin: 2,
      tips: [],
    },
    {
      id: "s2",
      text: "In a large bowl, whisk the yogurt with the garam masala, kosher salt and ginger-garlic paste. Add the chicken, toss to coat, cover, and refrigerate to marinate.",
      ingredientIds: ["i2", "i3", "i4", "i7", "i1"],
      applianceIds: [],
      estMin: 30,
      timer: { min: 30, max: 30 },
      tips: [],
    },
    {
      id: "s3",
      text: "Heat the oven to broil with a rack about 6 inches from the element.",
      ingredientIds: [],
      applianceIds: ["a1"],
      estMin: 1,
      tips: [],
    },
    {
      id: "s4",
      text: "Arrange the chicken on a sheet pan and broil, flipping once, until charred in spots and cooked through, about 8 minutes.",
      ingredientIds: ["i1"],
      applianceIds: ["a1"],
      estMin: 6,
      tips: [
        {
          id: "t1",
          anchorText: "until charred",
          text: "Broilers vary a lot. Start checking at the 5-minute mark, since the thin edges can go from charred to burnt quickly.",
        },
      ],
    },
    {
      id: "s5",
      text: "Melt the butter in a large skillet over medium heat and cook the onion until soft, about 5 minutes.",
      ingredientIds: ["i5", "i6"],
      applianceIds: ["a3"],
      estMin: 4,
      tips: [],
    },
    {
      id: "s6",
      text: "Blend the crushed tomatoes with the ginger-garlic paste until smooth, pour into the skillet, and simmer until thickened.",
      ingredientIds: ["i8", "i7"],
      applianceIds: ["a2", "a3"],
      estMin: 8,
      timer: { min: 5, max: 8 },
      tips: [],
    },
    {
      id: "s7",
      text: "Stir in the heavy cream and the broiled chicken, then simmer for 2 minutes more.",
      ingredientIds: ["i9", "i1"],
      applianceIds: ["a3"],
      estMin: 4,
      tips: [],
    },
  ],
};
