use codexbar::settings::ModelRateLimit;

use super::openai_live::ModelRateLimitSnapshot;

#[test]
fn model_rate_limit_snapshot_is_camel_case_with_null_rpm() {
    let limit = ModelRateLimit::new("gpt-5", 40_000_000, None);
    let json = serde_json::to_value(ModelRateLimitSnapshot::from(&limit)).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "model": "gpt-5",
            "tokensPerMinute": 40_000_000,
            "requestsPerMinute": null,
        })
    );
}

#[test]
fn model_rate_limit_snapshot_accepts_a_missing_rpm_from_the_editor() {
    let snapshot: ModelRateLimitSnapshot =
        serde_json::from_str(r#"{"model":"gpt-5","tokensPerMinute":1}"#).unwrap();
    assert_eq!(snapshot.requests_per_minute, None);
    assert_eq!(snapshot.tokens_per_minute, 1);
}
