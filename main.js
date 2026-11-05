export class PromptChainHost {
    constructor(workerUrl) {
        this.worker = new Worker(workerUrl, { type: 'module' });
        this.session = null;

        // Hooks for the UI
        this.onAgentThought = () => {};
        this.onAgentAction = () => {};
        this.onAgentComplete = () => {};

        this.worker.onmessage = this.handleWorkerMessage.bind(this);
    }

    async init(systemPrompt) {
        // Initialize the Gemini Nano session using the proper interface
        this.session = await LanguageModel.create({
            systemPrompt: systemPrompt
        });
        console.log("LLM Server Initialized on Main Thread.");
    }

    async handleWorkerMessage(event) {
        const { id, type, payload } = event.data;

        if (type === 'LLM_REQUEST') {
            try {
                const responseText = await this.session.prompt(payload.prompt, {
                    responseConstraint: payload.schema
                });
                this.worker.postMessage({ id, type: 'LLM_RESPONSE', payload: responseText });
            } catch (err) {
                console.error("Main Thread LLM Error:", err);
            }
        } else if (type === 'AGENT_THOUGHT') {
            this.onAgentThought(payload);
        } else if (type === 'AGENT_ACTION') {
            this.onAgentAction(payload);
        } else if (type === 'AGENT_COMPLETE') {
            this.onAgentComplete(payload);
        }
    }

    start(userPrompt) {
        this.worker.postMessage({ type: 'START_LOOP', payload: userPrompt });
    }
}
