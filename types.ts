
export interface GraphologyTrait {
  feature: string;
  observation: string;
  interpretation: string;
  confidence: number;
}

export interface AnalysisResult {
  personalitySummary: string;
  strengths: string[];
  weaknesses: string[];
  traits: GraphologyTrait[];
  graphologyBasis: string;
}

export interface ContextualResult {
  relevanceExplanation: string;
  suitabilityScore: number;
  actionableAdvice: string[];
  specificRisks: string[];
}

export enum AppState {
  CHOICE = 'CHOICE',
  LOCKED = 'LOCKED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  TOKEN_REQUESTED = 'TOKEN_REQUESTED',
  READY_FOR_UPLOAD = 'READY_FOR_UPLOAD',
  ANALYZING = 'ANALYZING',
  RESULT = 'RESULT',
  ANALYZING_CONTEXT = 'ANALYZING_CONTEXT',
  CONTEXT_RESULT = 'CONTEXT_RESULT',
  ERROR = 'ERROR'
}
