import State from "./state";
import { DocumentChanges } from "../render_plugin/document_changes_listener";
import EventListener from "../event_listener";
import Context from "../context_detection";
import {showIssueReportNotice} from "../support/issue_notice";
import {extractProviderError} from "../prediction_services/provider";

class PredictingState extends State {
    private predictionPromise: Promise<void> | null = null;
    private isStillNeeded = true;
    private readonly prefix: string;
    private readonly suffix: string;

    constructor(context: EventListener, prefix: string, suffix: string) {
        super(context);
        this.prefix = prefix;
        this.suffix = suffix;
    }

    static createAndStartPredicting(
        context: EventListener,
        prefix: string,
        suffix: string
    ): PredictingState {
        const predictingState = new PredictingState(context, prefix, suffix);
        predictingState.startPredicting();
        context.setContext(Context.getContext(prefix, suffix));
        return predictingState;
    }

    handleCancelKeyPressed(): boolean {
        this.cancelPrediction();
        return true;
    }

    async handleDocumentChange(
        documentChanges: DocumentChanges
    ): Promise<void> {
        if (
            documentChanges.hasCursorMoved() ||
            documentChanges.hasUserTyped() ||
            documentChanges.hasUserDeleted() ||
            documentChanges.isTextAdded()
        ) {
            this.cancelPrediction();
        }
    }

    private cancelPrediction(): void {
        this.isStillNeeded = false;
        this.context.transitionToIdleState();
    }

    startPredicting(): void {
        this.predictionPromise = this.predict();
    }

    private async predict(): Promise<void> {

        const result =
            await this.context.predictionService?.fetchPredictions(
                this.prefix,
                this.suffix
            );

        if (!this.isStillNeeded) {
            return;
        }

        if (result.isErr()) {
            showIssueReportNotice(
                "Copilot: The plugin could not generate a prediction. Open Advanced Settings to view Last request diagnostics, or check the developer console.",
                {
                    source: "prediction",
                    pluginVersion: this.context.pluginVersion,
                    settings: this.context.settings,
                    error: result.error,
                }
            );
            const providerError = extractProviderError(result.error);
            console.error("Copilot prediction failed", providerError
                ? {
                    provider: providerError.provider,
                    code: providerError.code,
                    statusCode: providerError.statusCode,
                    retryable: providerError.retryable,
                    safeDiagnostics: providerError.safeDiagnostics,
                }
                : {name: result.error.name});
            this.context.transitionToIdleState();
        }

        const prediction = result.unwrapOr("");

        if (prediction === "") {
            this.context.transitionToIdleState();
            return;
        }
        this.context.transitionToSuggestingState(prediction, this.prefix, this.suffix);
    }


    getStatusBarText(): string {
        return `Predicting for ${this.context.context}`;
    }
}

export default PredictingState;
