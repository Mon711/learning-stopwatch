declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    LEARNING_SHARED_OWNER_ID?: string;
    LEARNING_SHARED_VIEWER_EMAIL?: string;
    LEARNING_SHARED_OWNER_NAME?: string;
    BUCKET?: R2Bucket;
  }
}
