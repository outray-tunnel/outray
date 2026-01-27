declare module "@paystack/inline-js" {
  interface PaystackPopupOptions {
    onSuccess?: (transaction: { reference: string }) => void;
    onCancel?: () => void;
  }

  export default class PaystackPop {
    constructor();
    resumeTransaction(accessCode: string, options?: PaystackPopupOptions): void;
    newTransaction(options: {
      key: string;
      email: string;
      amount: number;
      ref?: string;
      metadata?: Record<string, unknown>;
      onSuccess?: (transaction: { reference: string }) => void;
      onCancel?: () => void;
    }): void;
  }
}
