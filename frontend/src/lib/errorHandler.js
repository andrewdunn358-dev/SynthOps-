/**
 * Extracts a human-readable error message from an API error response.
 * Handles Pydantic validation errors (array format) and regular string errors.
 * 
 * @param {Error} error - The error object from axios/API call
 * @param {string} fallback - Fallback message if no detail found
 * @returns {string} - Human-readable error message
 */
export function getErrorMessage(error, fallback = 'An error occurred') {
  const detail = error?.response?.data?.detail;
  
  if (!detail) {
    return fallback;
  }
  
  // If detail is a string, return it directly
  if (typeof detail === 'string') {
    return detail;
  }
  
  // If detail is an array (Pydantic validation errors), extract messages
  if (Array.isArray(detail)) {
    const messages = detail.map(err => {
      if (typeof err === 'string') return err;
      if (err.msg) {
        // Format: "Field required" or "field: message"
        const loc = err.loc?.filter(l => l !== 'body').join('.');
        return loc ? `${loc}: ${err.msg}` : err.msg;
      }
      return String(err);
    });
    return messages.join(', ');
  }
  
  // If detail is an object, try to get a message property
  if (typeof detail === 'object' && detail.msg) {
    return detail.msg;
  }
  
  return fallback;
}
