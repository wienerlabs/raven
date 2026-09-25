import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'

describe('access proxy', () => {
  it('serves the public film without a session and keeps the panel closed', () => {
    for (const path of ['/film/raven-film.mp4', '/brand/raven-mark.svg', '/r/AbCdE12345']) {
      expect(proxy(new NextRequest(`https://raven.example.com${path}`)).headers.get('x-middleware-next')).toBe('1')
    }
    for (const path of ['/whatsapp', '/filmler', '/']) {
      const response = proxy(new NextRequest(`https://raven.example.com${path}`))
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('https://raven.example.com/giris')
    }
    expect(proxy(new NextRequest('https://raven.example.com/api/search')).status).toBe(401)
  })
})
