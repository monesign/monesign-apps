import testTokens from '@monesign/templates-tokens'

export const getTestTokenAddresses = (network = 'rinkeby') =>
  (testTokens[network] && testTokens[network].tokens) || []
