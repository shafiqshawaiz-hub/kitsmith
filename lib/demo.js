// Demo mode: used only when ANTHROPIC_API_KEY is not set. Clearly fake sample content.
export const demoSweetSpot = {
  summary: "DEMO DATA. This is sample output so you can test the site. Add an API key to get real results.",
  ideas: [
    { id: "a", title: "Sample Idea A", audience: "Sample audience A", pain: "Sample problem A", whyYou: "Based on what you told us (demo).", format: "guide, because it is quick to produce", demandCheck: "Post a poll asking 10 people in your target group if they would use this.", risk: "Demo risk text.", fit: 8 },
    { id: "b", title: "Sample Idea B", audience: "Sample audience B", pain: "Sample problem B", whyYou: "Based on what you told us (demo).", format: "course, because it is a skill people want to see", demandCheck: "Ask five people to describe how they solve this today.", risk: "Demo risk text.", fit: 6 },
    { id: "c", title: "Sample Idea C", audience: "Sample audience C", pain: "Sample problem C", whyYou: "Based on what you told us (demo).", format: "guide", demandCheck: "Search forums for the question and count how often it is asked.", risk: "Demo risk text.", fit: 5 },
  ],
};

export const demoBlueprint = {
  title: "Sample Product (demo)",
  promise: "After finishing, the customer can complete a sample task they could not before.",
  audience: "Sample audience",
  notFor: "Anyone who wants instant results with no effort.",
  startingPoint: "The customer has the problem but no plan.",
  finishLine: "The customer has a finished sample deliverable.",
  stages: [
    { name: "Set the goal", goal: "Pick a clear target", outcome: "A one-sentence goal", lessons: ["Why goals fail", "Write yours", "Test it"] },
    { name: "Build the base", goal: "Create the core piece", outcome: "A first draft", lessons: ["What goes in", "Draft it", "Fix it"] },
    { name: "Ship it", goal: "Put it in front of people", outcome: "A published result", lessons: ["Choose where", "Publish", "Ask for feedback"] },
  ],
  pricingNote: "Demo note. Compare with similar products you find yourself.",
  proofNeeded: "Add your own real examples and results.",
  launchSteps: ["Finish the draft", "Make a cover", "Create a listing", "Share with ten people"],
};

export function demoSection(kind, charter, index) {
  const name = charter?.stages?.[index]?.name || "Section";
  return `# DEMO: ${kind} ${kind === "stage" || kind === "module" ? index + 1 + " - " + name : ""}

This is placeholder text so you can test the build, preview and export steps without an API key.

## What a real section looks like

- Real output is written by the AI from your blueprint.
- It has headings, steps, an exercise and a checklist.
- You review and edit it before selling.

[Add your own real example here]
`;
}
