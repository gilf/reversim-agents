// A simple RPC wrapper to ask the Main Thread for LLM inference
let msgIdCounter = 0;
const pendingRequests = new Map();

function askMainThreadLLM(prompt, schema) {
    return new Promise((resolve) => {
        const id = ++msgIdCounter;
        pendingRequests.set(id, resolve);

        postMessage({
            id,
            type: 'LLM_REQUEST',
            payload: { prompt, schema }
        });
    });
}

// Listen for the LLM response from the Main Thread
self.onmessage = async (event) => {
    const { id, type, payload } = event.data;

    if (type === 'LLM_RESPONSE') {
        const resolve = pendingRequests.get(id);
        if (resolve) {
            resolve(payload);
            pendingRequests.delete(id);
        }
    } else if (type === 'START_LOOP') {
        // Boot up the agent loop when requested
        await runAgentLoop(payload);
    }
};

const supervisorSchema = {
    type: "object",
    required: ["thought", "tool", "toolInput", "finalAnswer"],
    properties: {
        thought: { type: "string", description: "Reasoning for the next step." },
        tool: { type: "string", description: "Tool name to execute, or 'none'." },
        toolInput: { type: "string", description: "Input for the tool." },
        finalAnswer: { type: "string", description: "Populate this if tool is 'none'." }
    }
};

// We manage context purely as a string array within the worker
let contextHistory = [];

async function runAgentLoop(userPrompt) {
    contextHistory.push(`User: ${userPrompt}`);
    let loopCount = 0;
    const MAX_STEPS = 5;

    while (loopCount < MAX_STEPS) {
        loopCount++;

        // Combine history into a single prompt string
        const currentPrompt = contextHistory.join('\n') + '\n\nDecide next action:';

        // 1. Reason (Ask Main Thread to run LLM)
        const llmResponse = await askMainThreadLLM(currentPrompt, supervisorSchema);

        // 2. Parse Deterministic JSON
        const decision = JSON.parse(llmResponse);
        const toolName = (decision.tool || '').toLowerCase();
        contextHistory.push(`Agent Thought: ${decision.thought}`);
        postMessage({ type: 'AGENT_THOUGHT', payload: `Agent Thought: ${decision.thought}` });

        // 3. Act (Execute Tool or Finish)
        if (toolName === 'none') {
            // Agent is done
            postMessage({ type: 'AGENT_COMPLETE', payload: decision.finalAnswer });
            return;
        }

        if (decision.tool === 'getWeather') {
            // Simulate a background API call inside the worker
            const observation = `The weather in ${decision.toolInput} is sunny.`;
            contextHistory.push(`Observation: ${observation}`);
            postMessage({ type: 'AGENT_ACTION', payload: `Observation: ${observation}` });
        }
    }
    postMessage({ type: 'AGENT_COMPLETE', payload: "Error: Max steps reached." });
}