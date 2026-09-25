const automated = /(bot|crawler|spider|preview|scanner|safelinks|proofpoint|mimecast|barracuda|headless|python-requests|curl|wget|facebookexternalhit|slackbot)/i

export function isAutomatedAgent(agent: string | null): boolean {
  return automated.test(agent ?? '')
}
