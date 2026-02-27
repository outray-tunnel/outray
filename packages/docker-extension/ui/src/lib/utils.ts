// TODO: enhance for zod error parsing
export function getErrorMessage(error: any) {
    try {
        const parsed = JSON.parse(error.message);

        // Check if the error is a custom error
        if (parsed.error) {
            return parsed.error;
        }

        return parsed.message;
    } catch (error) {
        return error;
    }
}