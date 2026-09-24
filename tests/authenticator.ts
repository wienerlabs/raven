import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'

function encode(bytes: Uint8Array): string {
  return isoBase64URL.fromBuffer(new Uint8Array(bytes))
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value)
  return buffer
}

export function softAuthenticator(origin: string, rpId: string, options: { userVerified?: boolean } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string }
  const credentialId = randomBytes(32)
  const rpIdHash = createHash('sha256').update(rpId).digest()
  const verifiedFlag = options.userVerified === false ? 0 : 0x04
  let counter = 0
  let userHandle: string | undefined

  return {
    id: encode(credentialId),
    register(creation: { challenge: string; user: { id: string } }) {
      userHandle = creation.user.id
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, -7],
          [-1, 1],
          [-2, isoBase64URL.toBuffer(jwk.x)],
          [-3, isoBase64URL.toBuffer(jwk.y)],
        ]),
      )
      const idLength = Buffer.alloc(2)
      idLength.writeUInt16BE(credentialId.length)
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x01 | verifiedFlag | 0x40]), uint32(counter), Buffer.alloc(16), idLength, credentialId, Buffer.from(cose)])
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: creation.challenge, origin, crossOrigin: false }))
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Map<string, string> | Uint8Array>([
          ['fmt', 'none'],
          ['attStmt', new Map<string, string>()],
          ['authData', new Uint8Array(authData)],
        ]),
      )
      return {
        id: encode(credentialId),
        rawId: encode(credentialId),
        type: 'public-key',
        response: { clientDataJSON: encode(clientDataJSON), attestationObject: encode(attestationObject), transports: ['internal'] },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },
    authenticate(request: { challenge: string }, overrides: { origin?: string } = {}) {
      counter += 1
      const authData = Buffer.concat([rpIdHash, Buffer.from([0x01 | verifiedFlag]), uint32(counter)])
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: request.challenge, origin: overrides.origin ?? origin, crossOrigin: false }))
      const signature = sign('sha256', Buffer.concat([authData, createHash('sha256').update(clientDataJSON).digest()]), privateKey)
      return {
        id: encode(credentialId),
        rawId: encode(credentialId),
        type: 'public-key',
        response: { clientDataJSON: encode(clientDataJSON), authenticatorData: encode(authData), signature: encode(signature), userHandle },
        clientExtensionResults: {},
        authenticatorAttachment: 'platform',
      }
    },
  }
}
