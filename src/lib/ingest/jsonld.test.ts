import { describe, expect, it } from "vitest";
import { extractJsonLdRecipe, extractPageText, extractSiteName, parseIsoDurationMin } from "./jsonld";

const PAGE = "https://www.example-kitchen.com/recipes/butter-chicken/";

/** Wraps JSON-LD payloads in a minimal page. Accepts several blocks. */
function page(...blocks: string[]): string {
  const scripts = blocks.map((b) => `<script type="application/ld+json">${b}</script>`).join("\n");
  return `<!doctype html><html><head><title>Test</title>${scripts}</head><body><p>Hi</p></body></html>`;
}

describe("extractJsonLdRecipe", () => {
  it("finds a Recipe inside @graph next to a WebPage", () => {
    const html = page(
      JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebPage", name: "Butter chicken page" },
          {
            "@type": "Recipe",
            name: "Butter Chicken",
            recipeIngredient: ["1 lb chicken", "1 cup cream"],
            recipeInstructions: ["Marinate.", "Cook."],
          },
        ],
      }),
    );
    const recipe = extractJsonLdRecipe(html, PAGE);
    expect(recipe?.name).toBe("Butter Chicken");
    expect(recipe?.ingredients).toEqual(["1 lb chicken", "1 cup cream"]);
    expect(recipe?.instructions).toEqual(["Marinate.", "Cook."]);
  });

  it("finds a Recipe in a top-level array", () => {
    const html = page(
      JSON.stringify([
        { "@type": "BreadcrumbList", itemListElement: [] },
        { "@type": "Recipe", name: "Dal", recipeIngredient: ["1 cup lentils"] },
      ]),
    );
    expect(extractJsonLdRecipe(html, PAGE)?.name).toBe("Dal");
  });

  it("accepts @type as an array that contains Recipe", () => {
    const html = page(JSON.stringify({ "@type": ["Recipe", "NewsArticle"], name: "Soup" }));
    expect(extractJsonLdRecipe(html, PAGE)?.name).toBe("Soup");
  });

  it("finds a Recipe under mainEntity", () => {
    const html = page(JSON.stringify({ "@type": "WebPage", mainEntity: { "@type": "Recipe", name: "Rice" } }));
    expect(extractJsonLdRecipe(html, PAGE)?.name).toBe("Rice");
  });

  it("flattens HowToSection with nested steps into 'Section:' entries", () => {
    const html = page(
      JSON.stringify({
        "@type": "Recipe",
        name: "Curry",
        recipeInstructions: [
          {
            "@type": "HowToSection",
            name: "For the sauce",
            itemListElement: [
              { "@type": "HowToStep", text: "Blend the onions." },
              { "@type": "HowToStep", name: "Fry", text: "Fry the spices." },
            ],
          },
          {
            "@type": "HowToSection",
            name: "Assembly",
            itemListElement: [{ "@type": "HowToStep", name: "Serve hot." }],
          },
        ],
      }),
    );
    expect(extractJsonLdRecipe(html, PAGE)?.instructions).toEqual([
      "Section: For the sauce",
      "Blend the onions.",
      "Fry the spices.",
      "Section: Assembly",
      "Serve hot.",
    ]);
  });

  it("reads plain-string instructions, one entry per line", () => {
    const html = page(JSON.stringify({ "@type": "Recipe", recipeInstructions: "Mix well.\nBake for 20 minutes." }));
    expect(extractJsonLdRecipe(html, PAGE)?.instructions).toEqual(["Mix well.", "Bake for 20 minutes."]);
  });

  it("strips HTML and decodes entities in text", () => {
    const html = page(
      JSON.stringify({
        "@type": "Recipe",
        name: "Salt &amp; Pepper &quot;Steak&quot;",
        recipeIngredient: ["<b>2</b>&nbsp;tbsp&nbsp;salt &amp; pepper"],
        recipeInstructions: ["<p>Mix &amp; stir the <strong>sauce</strong>.</p><p>Serve&nbsp;hot.</p>"],
      }),
    );
    const recipe = extractJsonLdRecipe(html, PAGE);
    expect(recipe?.name).toBe('Salt & Pepper "Steak"');
    expect(recipe?.ingredients).toEqual(["2 tbsp salt & pepper"]);
    expect(recipe?.instructions).toEqual(["Mix & stir the sauce.", "Serve hot."]);
  });

  it("resolves image arrays of ImageObject against the page URL and keeps http(s) only", () => {
    const html = page(
      JSON.stringify({
        "@type": "Recipe",
        image: [
          { "@type": "ImageObject", url: "data:image/png;base64,AAAA" },
          { "@type": "ImageObject", url: "/images/chicken.jpg" },
        ],
      }),
    );
    expect(extractJsonLdRecipe(html, PAGE)?.imageUrl).toBe("https://www.example-kitchen.com/images/chicken.jpg");
  });

  it("reads a single image string", () => {
    const html = page(JSON.stringify({ "@type": "Recipe", image: "https://cdn.example.com/a.jpg" }));
    expect(extractJsonLdRecipe(html, PAGE)?.imageUrl).toBe("https://cdn.example.com/a.jpg");
  });

  it("reads author from a string, an object, or an array", () => {
    const names = (author: unknown) =>
      extractJsonLdRecipe(page(JSON.stringify({ "@type": "Recipe", author })), PAGE)?.author;
    expect(names("Jo")).toBe("Jo");
    expect(names({ "@type": "Person", name: "Jo" })).toBe("Jo");
    expect(
      names([
        { "@type": "Person", name: "Jo" },
        { "@type": "Organization", name: "Test Kitchen" },
      ]),
    ).toBe("Jo, Test Kitchen");
  });

  it("picks a yield with a number, from a string, a number, or an array", () => {
    const yieldOf = (recipeYield: unknown) =>
      extractJsonLdRecipe(page(JSON.stringify({ "@type": "Recipe", recipeYield })), PAGE)?.recipeYield;
    expect(yieldOf("4 servings")).toBe("4 servings");
    expect(yieldOf(4)).toBe("4");
    expect(yieldOf(["Makes one loaf", "8 buns"])).toBe("8 buns");
    expect(yieldOf(["serves a crowd", "about 2 dozen"])).toBe("about 2 dozen");
    expect(yieldOf(["serves a crowd"])).toBe("serves a crowd");
  });

  it("converts durations and derives totalTime from prep + cook when missing", () => {
    const recipe = extractJsonLdRecipe(
      page(JSON.stringify({ "@type": "Recipe", prepTime: "PT15M", cookTime: "PT1H" })),
      PAGE,
    );
    expect(recipe?.prepTimeMin).toBe(15);
    expect(recipe?.cookTimeMin).toBe(60);
    expect(recipe?.totalTimeMin).toBe(75);
  });

  it("prefers an explicit totalTime over prep + cook", () => {
    const recipe = extractJsonLdRecipe(
      page(JSON.stringify({ "@type": "Recipe", totalTime: "PT1H30M", prepTime: "PT15M", cookTime: "PT1H" })),
      PAGE,
    );
    expect(recipe?.totalTimeMin).toBe(90);
  });

  it("uses siteName from og:site_name, then publisher, then hostname", () => {
    const withOg = `<meta property="og:site_name" content="Kitchen &amp; Co"><script type="application/ld+json">${JSON.stringify(
      { "@type": "Recipe", name: "A", publisher: { name: "Ignored" } },
    )}</script>`;
    expect(extractJsonLdRecipe(withOg, PAGE)?.siteName).toBe("Kitchen & Co");

    const withPublisher = page(JSON.stringify({ "@type": "Recipe", name: "A", publisher: { name: "Publisher Ltd" } }));
    expect(extractJsonLdRecipe(withPublisher, PAGE)?.siteName).toBe("Publisher Ltd");

    const bare = page(JSON.stringify({ "@type": "Recipe", name: "A" }));
    expect(extractJsonLdRecipe(bare, PAGE)?.siteName).toBe("example-kitchen.com");
  });

  it("skips an invalid JSON block and still reads the valid one", () => {
    const html = page("{ this is not json", JSON.stringify({ "@type": "Recipe", name: "Still here" }));
    expect(extractJsonLdRecipe(html, PAGE)?.name).toBe("Still here");
  });

  it("retries a block with raw line breaks inside a string", () => {
    const raw = '{"@type": "Recipe", "name": "Garlic\nButter Pasta"}';
    const html = `<script type="application/ld+json">${raw}</script>`;
    expect(extractJsonLdRecipe(html, PAGE)?.name).toBe("Garlic Butter Pasta");
  });

  it("returns null when the page has no Recipe", () => {
    const html = page(JSON.stringify({ "@type": "NewsArticle", headline: "Not a recipe" }));
    expect(extractJsonLdRecipe(html, PAGE)).toBeNull();
    expect(extractJsonLdRecipe("<html><body>plain</body></html>", PAGE)).toBeNull();
  });
});

describe("parseIsoDurationMin", () => {
  it("parses hours and minutes", () => {
    expect(parseIsoDurationMin("PT1H30M")).toBe(90);
  });

  it("parses minutes only", () => {
    expect(parseIsoDurationMin("PT90M")).toBe(90);
  });

  it("parses a zero-day form", () => {
    expect(parseIsoDurationMin("P0DT0H45M")).toBe(45);
  });

  it("parses days and seconds", () => {
    expect(parseIsoDurationMin("P1DT0H0M30S")).toBe(1440 + 1);
  });

  it("returns undefined for garbage", () => {
    expect(parseIsoDurationMin("about an hour")).toBeUndefined();
    expect(parseIsoDurationMin("PT")).toBeUndefined();
    expect(parseIsoDurationMin("P")).toBeUndefined();
    expect(parseIsoDurationMin(45)).toBeUndefined();
    expect(parseIsoDurationMin(undefined)).toBeUndefined();
  });
});

describe("extractSiteName", () => {
  it("falls back to the hostname without www.", () => {
    expect(extractSiteName("<html><body></body></html>", PAGE)).toBe("example-kitchen.com");
  });

  it("prefers og:site_name", () => {
    const html = `<meta property="og:site_name" content="Budget Bytes">`;
    expect(extractSiteName(html, PAGE)).toBe("Budget Bytes");
  });
});

describe("extractPageText", () => {
  it("drops scripts, styles and navigation", () => {
    const html = `<html><head><style>.x{color:red}</style></head><body>
      <nav>Home | Recipes | Login</nav>
      <header>Site header</header>
      <script>var secret = 1;</script>
      <main><h1>Pancakes</h1><p>Whisk the flour &amp; milk.</p><p>Fry until golden.</p></main>
      <footer>Copyright</footer>
      <form><input value="search"></form>
    </body></html>`;
    const text = extractPageText(html);
    expect(text).toContain("Pancakes");
    expect(text).toContain("Whisk the flour & milk.");
    expect(text).toContain("Fry until golden.");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("Home | Recipes");
    expect(text).not.toContain("Copyright");
    expect(text.split("\n")).toContain("Fry until golden.");
  });

  it("keeps an ASP.NET form that wraps the content, and an h1 inside a header", () => {
    const html = `<html><body>
      <header><h1>Chicken Curry</h1><nav>Menu | Login</nav></header>
      <form id="form1" runat="server"><div class="content"><p>Simmer the onions until soft, then add the spices and chicken and cook for ten minutes.</p></div></form>
      <footer>Copyright 2026</footer>
    </body></html>`;
    const text = extractPageText(html);
    expect(text).toContain("Chicken Curry");
    expect(text).toContain("Simmer the onions");
    expect(text).not.toContain("Menu | Login");
    expect(text).not.toContain("Copyright");
  });

  it("keeps a form that holds an article, and drops a small search form", () => {
    const html = `<body>
      <form><input value="search"></form>
      <form><article><p>Whisk the eggs and sugar together until pale.</p></article></form>
    </body>`;
    const text = extractPageText(html);
    expect(text).toContain("Whisk the eggs and sugar together until pale.");
    expect(text).not.toContain("search");
  });

  it("truncates to maxChars", () => {
    const html = `<body><p>${"word ".repeat(1000)}</p></body>`;
    expect(extractPageText(html, 100).length).toBeLessThanOrEqual(100);
  });
});
