import { describe, it, expect } from 'vitest'
import type { LobsterPool, FactoryInfo } from '../types'

describe('lobster/types', () => {
  it('LobsterPool has the four expected address fields', () => {
    const sample: LobsterPool = {
      lobsterAddress: 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO',
      owner: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
      token1: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    }
    expect(sample.lobsterAddress).toMatch(/^C[A-Z2-7]{55}$/)
    expect(sample.owner).toMatch(/^G[A-Z2-7]{55}$/)
    expect(sample.token0).toMatch(/^C[A-Z2-7]{55}$/)
    expect(sample.token1).toMatch(/^C[A-Z2-7]{55}$/)
  })

  it('FactoryInfo carries admin, wasmHash and poolCount', () => {
    const info: FactoryInfo = {
      admin: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      wasmHash: '837d3d9f265304e8eea935fe78342eb50e2291a4035048e0bef39431e300dc34',
      poolCount: 0,
    }
    expect(info.wasmHash).toHaveLength(64)
    expect(info.poolCount).toBeGreaterThanOrEqual(0)
  })

})
