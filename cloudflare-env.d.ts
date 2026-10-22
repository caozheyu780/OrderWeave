declare namespace Cloudflare {
  interface Env {
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_MODEL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
