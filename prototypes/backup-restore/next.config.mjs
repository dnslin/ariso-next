// Keep the prototype isolated from production instrumentation and server routes.
const config = { agentRules: false, devIndicators: false };
export default config;
