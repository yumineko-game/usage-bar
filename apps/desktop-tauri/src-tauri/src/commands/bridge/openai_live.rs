//! Stored model limits for OpenAI API usage.

use codexbar::settings::ModelRateLimit;
use serde::{Deserialize, Serialize};

/// One manual organization limit, as stored in settings and sent by the editor.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelRateLimitSnapshot {
    pub model: String,
    pub tokens_per_minute: u64,
    #[serde(default)]
    pub requests_per_minute: Option<u64>,
}

impl From<&ModelRateLimit> for ModelRateLimitSnapshot {
    fn from(limit: &ModelRateLimit) -> Self {
        Self {
            model: limit.model.clone(),
            tokens_per_minute: limit.tokens_per_minute,
            requests_per_minute: limit.requests_per_minute,
        }
    }
}
