import { init, RsaPrivate, RsaPublic, } from './rsa_bg.js';
import { MD5, } from '../algo/hash/md5.js';
import { SHA1, } from '../algo/hash/sha1.js';
import { SHA224, } from '../algo/hash/sha224.js';
import { SHA256, } from '../algo/hash/sha256.js';
import { SHA384, } from '../algo/hash/sha384.js';
import { SHA512, } from '../algo/hash/sha512.js';
import { RIPEMD160, } from '../algo/hash/ripemd160.js';

const DEFAULT_RSA_KEY_SIZE = 1024;
const DEFAULT_IS_PUBLIC_KEY = false;
const DEFAULT_RSA_ENCRYPT_PADDING = 'OAEP';
const DEFAULT_RSA_SIGN_PADDING = 'PSS';
const DEFAULT_RSA_HASH_ALGO = 'SHA256';
const RSA_PRIVATE_KEY_START = '-----BEGIN PRIVATE KEY-----';
const RSA_PUBLIC_KEY_START = '-----BEGIN PUBLIC KEY-----';

// TODO: what if a new hasher is added?
const RSA_HASH_ALGOS = new Map([
  ['MD5', MD5,],
  ['SHA1', SHA1,],
  ['SHA224', SHA224,],
  ['SHA256', SHA256,],
  ['SHA384', SHA384,],
  ['SHA512', SHA512,],
  ['RIPEMD160', RIPEMD160,],
]);

// TODO: should extend AsymmetricCipher(class not created yet)
export class RSAAlgo {
  // TODO: invalid inputs should be check and reported
  static wasm = null;
  static keyFilePathOrKeySize = null;
  static isPublicKey = false;
  static keyChanged = false;

  /**
   * Update the key of RSA. The input can be a path to the private/public key file, or the key size in bits
   *
   * @param keyFilePathOrKeySize {string | number} the key file path or key size in bytes, set as 1024 bits as default
   * @param isPublicKey true if the input key file is a public key file
   */
  static updateRsaKey(keyFilePathOrKeySize = DEFAULT_RSA_KEY_SIZE, isPublicKey = DEFAULT_IS_PUBLIC_KEY) {
    if (keyFilePathOrKeySize === null || keyFilePathOrKeySize === undefined) {
      keyFilePathOrKeySize = 1024;
    }

    if (typeof keyFilePathOrKeySize !== 'number' && typeof keyFilePathOrKeySize !== 'string') {
      throw new Error('The input keyFilePathOrKeySize should be a number or string');
    }

    if (keyFilePathOrKeySize === RSAAlgo.keyFilePathOrKeySize && isPublicKey == RSAAlgo.isPublicKey) {
      // do not update keys if nothing changed
      return;
    }
    RSAAlgo.keyFilePathOrKeySize = keyFilePathOrKeySize;
    RSAAlgo.isPublicKey = isPublicKey;
    RSAAlgo.keyChanged = true;
  }

  updateRsaKey(keyFilePathOrKeySize, isPublicKey) {
    RSAAlgo.updateRsaKey(keyFilePathOrKeySize, isPublicKey);
  }

  static async loadWasm() {
    if (RSAAlgo.wasm) {
      return RSAAlgo.wasm;
    }

    await init();
    RSAAlgo.wasm = true;
    return RSAAlgo.wasm;
  }

  async loadWasm() {
    return RSAAlgo.loadWasm();
  }

  /**
   * Constructor of RSAAlgo
   *
   * @param keyFilePathOrKeySize {string | number | null} the key file path or key size in bytes, set as 1024 bits as default
   * @param cfg {object} the config for rsa
   */
  constructor(keyFilePathOrKeySize, cfg) {
    RSAAlgo.updateRsaKey(keyFilePathOrKeySize);
    this.resetConfig();
    this.updateConfig(cfg);
  }

  /**
   * Reset config to default
   */
  resetConfig() {
    this.updateRsaKey(DEFAULT_RSA_KEY_SIZE, DEFAULT_IS_PUBLIC_KEY);
    this.updateEncryptPadding(DEFAULT_RSA_ENCRYPT_PADDING);
    this.updateSignPadding(DEFAULT_RSA_SIGN_PADDING);
    this.updateHashAlgo(DEFAULT_RSA_HASH_ALGO);
  }

  /**
   * Update the config for rsa. The configs of RSA are:
   * encryptPadding: encrypt padding mode, values may be 'OAEP'(default)/'PKCS1V15'
   * signPadding: sign padding mode, values may be 'PSS'(default)/'PKCS1V15'
   * hashAlgo: hasher for encryption and sign, values may be 'sha256'(default)/'md5'/'sha1'/'sha224'/'sha384'/'sha512'/'ripemd160'
   * key: can be path to the RSA key file(string), the content of RSA key(string), or the size of the RSA key(number)
   * isPublicKey: true if the cfg.key is the RSA public key
   *
   * @param cfg {object} the config for rsa
   */
  // TODO: invalid configurations should be reported here
  updateConfig(cfg) {
    if (cfg !== undefined) {
      if (cfg.encryptPadding !== undefined && typeof cfg.encryptPadding === 'string') {
        this.updateEncryptPadding(cfg.encryptPadding.toUpperCase());
      }

      if (cfg.signPadding !== undefined && typeof cfg.signPadding === 'string') {
        this.updateSignPadding(cfg.signPadding.toUpperCase());
      }

      if (cfg.hashAlgo !== undefined && typeof cfg.hashAlgo === 'string') {
        this.updateHashAlgo(cfg.hashAlgo.toUpperCase());
      }

      if (cfg.key !== undefined) {
        this.updateRsaKey(cfg.key, cfg.isPublicKey);
      }
    }
  }

  /**
   * init keys from key file or key size
   */
  initKeys() {
    if (!RSAAlgo.wasm) {
      throw new Error('WASM is not loaded yet. \'RSAAlgo.loadWasm\' should be called first');
    }

    // only update keys if key has been changed, and private/public key is specified
    if (!RSAAlgo.keyChanged && (this.RsaPrivate !== undefined || this.RsaPublic != undefined)) {
      return;
    }

    if (RSAAlgo.keyFilePathOrKeySize === undefined) {
      this.initFromKeySize(DEFAULT_RSA_KEY_SIZE);
      RSAAlgo.keyChanged = false;
      return;
    }

    if (typeof RSAAlgo.keyFilePathOrKeySize === 'number') {
      this.initFromKeySize(RSAAlgo.keyFilePathOrKeySize);
      RSAAlgo.keyChanged = false;
      return;
    }

    if (typeof RSAAlgo.keyFilePathOrKeySize === 'string') {
      if (this.isRsaKeyContent(RSAAlgo.keyFilePathOrKeySize)) {
        this.initFromKeyContent(RSAAlgo.keyFilePathOrKeySize, RSAAlgo.isPublicKey);
      } else {
        this.initFromKeyFile(RSAAlgo.keyFilePathOrKeySize, RSAAlgo.isPublicKey);
      }
      RSAAlgo.keyChanged = false;
      return;
    }

    // set the key size to 1024 by default
    this.initFromKeySize(DEFAULT_RSA_KEY_SIZE);
    RSAAlgo.keyChanged = false;
  }

  /**
   * Return true if the given string is a rsa key content
   *
   * @param content the input content
   * @returns {boolean} true if the given string is a rsa key content
   */
  isRsaKeyContent(content) {
    if (content.startsWith(RSA_PRIVATE_KEY_START) || content.startsWith(RSA_PUBLIC_KEY_START)) {
      return true;
    }

    return false;
  }
  /**
   * Init rsa keys with given key content
   *
   * @param keyContent the input key content
   * @param isPublicKey true if the input content is a public content
   */
  initFromKeyContent(keyContent, isPublicKey = false) {
    isPublicKey
      ? this.initWithPublicKey(new RsaPublic(keyContent))
      : this.initWithPrivateKey(new RsaPrivate(null, keyContent));
  }

  /**
   * Init rsa keys with given key file
   * @param path the input key file path
   * @param isPublicKey true if the input key file is a public key file
   */
  initFromKeyFile(path, isPublicKey = false) {
    this.errorIfInBrowser();
    if (!RSAAlgo.wasm) {
      throw new Error('WASM is not loaded yet. \'RSAAlgo.loadWasm\' should be called first');
    }

    const fs = require('fs');

    if (!fs.existsSync(path)) {
      throw new Error('Can not find the key file in path :\n' + path);
    }
    const keyContent = fs.readFileSync(path, {
      encoding: 'utf-8',
      flag: 'r',
    });
    this.initFromKeyContent(keyContent, isPublicKey);
  }

  /**
   * Init rsa keys with given key size
   * @param bits key size in bytes
   */
  initFromKeySize(bits) {
    if (!RSAAlgo.wasm) {
      throw new Error('WASM is not loaded yet. \'RSAAlgo.loadWasm\' should be called first');
    }

    this.initWithPrivateKey(new RsaPrivate(bits));
  }

  updateEncryptPadding(encryptPadding) {
    this.encryptPadding = encryptPadding;
  }

  updateSignPadding(signPadding) {
    this.signPadding = signPadding;
  }

  updateHashAlgo(hashAlgo) {
    this.hashAlgo = hashAlgo;
  }

  initWithPublicKey(publicKey) {
    if (!RSAAlgo.wasm) {
      throw new Error('WASM is not loaded yet. \'RSAAlgo.loadWasm\' should be called first');
    }

    this.RsaPublic = publicKey;
    this.RsaPrivate = null;
  }

  initWithPrivateKey(privateKey) {
    if (!RSAAlgo.wasm) {
      throw new Error('WASM is not loaded yet. \'RSAAlgo.loadWasm\' should be called first');
    }

    if (privateKey === undefined) {
      // create a new 1024 bit RSA key pair if no parameter is specified
      privateKey = new RsaPrivate(DEFAULT_RSA_KEY_SIZE);
    }
    const publicKey = new RsaPublic(privateKey.getPublicKeyPem());

    this.RsaPrivate = privateKey;
    this.RsaPublic = publicKey;
  }

  /**
   * Encrypt the given message
   * @param {string | Uint8Array} msg the original message
   * @returns {Uint8Array} the encrypted message
   */
  encrypt(msg) {
    this.initKeys();

    return this.RsaPublic.encrypt(this.strToBytes(msg), this.encryptPadding, this.hashAlgo);
  }

  /**
   * Decrypt the given message
   * @param {Uint8Array} msgEncrypted the encrypted message
   * @returns {Uint8Array} the decrypted message
   */
  decrypt(msgEncrypted) {
    this.errorIfNoPrivateInstance();
    this.initKeys();

    let result;
    try {
      result = this.RsaPrivate.decrypt(msgEncrypted, this.encryptPadding, this.hashAlgo);
    } catch (e) {
      console.error('Error occurred when decrypting : ', e);
      return null;
    }
    return result;
  }

  /**
   * Generate the digest of the input message according to the specified hash algorithm
   *
   * @param {string} msg input message
   * @returns {Uint8Array} the digest of input message
   */
  digest (msg) {
    let digestAlgo = RSA_HASH_ALGOS.get(this.hashAlgo);
    const digestWords = digestAlgo(msg);
    const digestUint32Array = new Uint32Array(digestWords.words).slice(0, digestWords.sigBytes/4);
    const digest = new Uint8Array(digestUint32Array.buffer);

    return digest;
  }

  /**
   * RSA sign
   * @param {string | Uint8Array} digest the digest of the message
   * @returns {Uint8Array} the rsa signature
   */
  sign(digest) {
    this.errorIfNoPrivateInstance();
    this.initKeys();

    return this.RsaPrivate.sign(this.strToBytes(digest), this.signPadding, this.hashAlgo);
  }

  /**
   * Verify the given RSA signature
   * @param {Uint8Array} digest the digest of the message
   * @param {Uint8Array} signature the signature signed using private key
   * @returns {boolean} true if signature is valid
   */
  verify(digest, signature) {
    this.initKeys();

    return this.RsaPublic.verify(digest, signature, this.signPadding, this.hashAlgo);
  }

  generateKeyFile(keyType = 'pairs', fileFmt = 'pem', fileName = 'key', dir = './keys') {
    this.initKeys();
    this.errorIfInBrowser();

    // key type and file fmt should be case insensitive
    keyType = keyType.toLowerCase();
    fileFmt = fileFmt.toLowerCase();

    switch (keyType) {
    case 'pairs':
      this.generateKeyFile('private', fileFmt, fileName + '_private', dir);
      this.generateKeyFile('public', fileFmt, fileName + '_public', dir);
      return;
    case 'private':
      this.errorIfNoPrivateInstance();
      break;
    case 'public':
      // no operations
      break;
    default:
      throw TypeError('wrong key type provided. Should be \'pairs\', \'private\' or \'public\'');
    }

    let keyPath = `${dir}/${fileName}.${fileFmt}`;
    // get key content based on fileFmt
    let keyContent = this.getKeyContent(keyType, fileFmt);

    // TODO: .der file cannot be verified by openssl
    // TODO: .der file key content is not TypedArray now
    const fs = require('fs');

    // create dir if not existed
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }

    // write key file
    fs.writeFileSync(keyPath, keyContent);
  }

  /**
   * Get current key type
   * @returns {string} key type
   */
  getKeyType() {
    this.initKeys();
    return this.RsaPrivate ? 'private' : 'public';
  }

  /**
   * Get key content based on key type
   * @param keyType the type of key files. Should be "private" or "public"
   * @param keyFmt the encoding scheme. Should be "pem" or "der"
   * @returns {*}
   */
  getKeyContent(keyType, keyFmt = 'pem') {
    this.initKeys();

    if (keyType == 'private') {
      this.errorIfNoPrivateInstance();
      return this.RsaPrivate.getPrivateKeyContent(keyFmt);
    }

    if (keyType == 'public') {
      return this.RsaPublic.getPublicKeyContent(keyFmt);
    }

    throw TypeError('Key type should be private or public');
  }

  /**
   * String to Uint8Array
   * @param val
   * @returns {Uint8Array|*}
   */
  strToBytes(val) {
    if (typeof val === 'string') {
      let encoder = new TextEncoder();
      return encoder.encode(val);
    }

    return val;
  }

  /**
   * Throws if private key is not instantiated
   */
  errorIfNoPrivateInstance() {
    if (this.getKeyType() === 'public') {
      throw TypeError('Private key or public key has not been instantiated');
    }
  }

  /**
   * Throws if node-only function is called in browser
   */
  errorIfInBrowser() {
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      throw Error('This function is not supported in browser');
    }
  }
}

/**
 * Shortcut of RSAAlgo with an instantiated 1024 bits key pair
 * @name RSA
 * @type {RSAAlgo}
 *
 * @example
 *  // encrypt/decrypt
 *  const msg = "Secret";
 *  const msgEnc = RSA.encrypt(msg);
 *  const msgDec = RSA.decrypto(msgEnc);
 *
 *  // sign/verify
 *  const dig = createHash("sha256").update(msg).digest();
 *  const sig = RSA.sign(dig);
 *  const isVerified = RSA.verify(dig, sig);
 */
export const RSA = {
  // TODO: extract this into a helper class
  rsa : new RSAAlgo(),

  async loadWasm() {
    await RSAAlgo.loadWasm();
  },

  resetConfig() {
    this.rsa.resetConfig();
  },

  updateConfig(cfg) {
    this.rsa.updateConfig(cfg);
  },

  updateRsaKey(keyFilePathOrKeySize, isPublicKey) {
    this.rsa.updateRsaKey(keyFilePathOrKeySize, isPublicKey);
  },

  encrypt(message, cfg) {
    this.rsa.updateConfig(cfg);
    return this.rsa.encrypt(message);
  },

  decrypt(ciphertext, cfg) {
    this.rsa.updateConfig(cfg);
    return this.rsa.decrypt(ciphertext);
  },

  digest(message, cfg) {
    this.rsa.updateConfig(cfg);
    return this.rsa.digest(message);
  },

  sign(digest, cfg) {
    this.rsa.updateConfig(cfg);
    return this.rsa.sign(digest);
  },

  verify(digest, signature, cfg) {
    this.rsa.updateConfig(cfg);
    return this.rsa.verify(digest, signature);
  },

  generateKeyFile(keyType, fileFmt, fileName, dir) {
    return this.rsa.generateKeyFile(keyType, fileFmt, fileName, dir);
  },

  getKeyType() {
    return this.rsa.getKeyType();
  },

  getKeyContent(keyType, keyFmt) {
    return this.rsa.getKeyContent(keyType, keyFmt);
  },
};