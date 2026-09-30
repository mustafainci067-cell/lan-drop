// Cryptography utilities for End-to-End Encryption (E2EE) using Web Crypto API

// Convert ArrayBuffer to Base64url string
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Convert Base64url string to ArrayBuffer
export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate ECDH Key Pair
export async function generateECDHKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );
}

// Export Public Key to Base64Url string (to be shared via URL/QR)
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('raw', key);
  return arrayBufferToBase64Url(exported);
}

// Import Public Key from Base64Url string
export async function importPublicKey(base64url: string): Promise<CryptoKey> {
  const buffer = base64UrlToArrayBuffer(base64url);
  return await window.crypto.subtle.importKey(
    'raw',
    buffer,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  );
}

// Derive AES-GCM 256-bit key from ECDH Shared Secret
export async function deriveAESKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  return await window.crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false, // derived key is not extractable
    ['encrypt', 'decrypt']
  );
}

// Encrypt File Blob using AES-GCM
// Returns the Encrypted Blob and the 12-byte IV (Initialization Vector) used.
export async function encryptFile(file: Blob, aesKey: CryptoKey): Promise<{ encryptedBlob: Blob; ivBase64: string }> {
  const arrayBuffer = await file.arrayBuffer();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    aesKey,
    arrayBuffer
  );

  return {
    encryptedBlob: new Blob([encryptedBuffer]),
    ivBase64: arrayBufferToBase64Url(iv.buffer)
  };
}

// Decrypt File Blob using AES-GCM
export async function decryptFile(encryptedBlob: Blob, aesKey: CryptoKey, ivBase64: string): Promise<Blob> {
  const arrayBuffer = await encryptedBlob.arrayBuffer();
  const ivBuffer = base64UrlToArrayBuffer(ivBase64);
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(ivBuffer),
    },
    aesKey,
    arrayBuffer
  );

  return new Blob([decryptedBuffer]);
}

// Generate a random 6-digit PIN
export function generateRandomPin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Derive AES-GCM 256-bit key from a PIN using PBKDF2
export async function deriveKeyFromPin(pin: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  return await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('landrop_secure_salt_v1'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
