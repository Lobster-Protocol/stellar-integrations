import { Asset, Operation, TransactionBuilder, NotFoundError } from '@stellar/stellar-sdk'
import { useQuery } from '@tanstack/react-query'
import { getHorizonServer } from '../horizon/client'
import { useAccountExists } from '../horizon/account'
import { networkPassphrase } from '../lobster/client'
import type { Network } from '../lobster/types'
import { INCLUSION_FEE_STROOPS } from '../../config/contracts'

export async function hasTrustline(
  accountId: string,
  assetCode: string,
  assetIssuer: string,
  network: Network,
): Promise<boolean> {
  const server = getHorizonServer(network)
  try {
    const account = await server.loadAccount(accountId)
    return account.balances.some((b) => {
      if (b.asset_type === 'native') return false
      const ab = b as { asset_code?: string; asset_issuer?: string }
      return ab.asset_code === assetCode && ab.asset_issuer === assetIssuer
    })
  } catch (err) {
    // an unfunded account has no trustlines; any other error is a real failure the caller shows
    if (err instanceof NotFoundError) return false
    throw err
  }
}

// CCTP can't deliver to an account without this trustline; the burn waits until it exists
export async function buildTrustlineXdr(
  accountId: string,
  assetCode: string,
  assetIssuer: string,
  network: Network,
): Promise<string> {
  const server = getHorizonServer(network)
  let account
  try {
    account = await server.loadAccount(accountId)
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new Error(
        `This account is not funded on ${network} yet. Add some XLM first, then turn on the trustline.`,
      )
    }
    throw err
  }
  return new TransactionBuilder(account, {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(assetCode, assetIssuer) }))
    .setTimeout(180)
    .build()
    .toXDR()
}

export async function submitTrustlineTx(signedXdr: string, network: Network): Promise<string> {
  const server = getHorizonServer(network)
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase(network))
  const res = await server.submitTransaction(tx)
  return res.hash
}

// waits for the account to exist, a brand-new wallet would only 404 here
export function useTrustline(
  accountId: string | null,
  assetCode: string,
  assetIssuer: string,
  network: Network,
) {
  const exists = useAccountExists(network, accountId) === 'live'
  return useQuery<boolean>({
    queryKey: ['trustline', accountId, assetCode, assetIssuer, network],
    queryFn: () => hasTrustline(accountId!, assetCode, assetIssuer, network),
    enabled: !!accountId && !!assetIssuer && exists,
    staleTime: 60_000,
    retry: 1,
  })
}
