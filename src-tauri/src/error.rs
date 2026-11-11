use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct ApiError {
    pub message: String,
    pub code: String,
}

impl ApiError {
    pub fn new(message: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            code: code.into(),
        }
    }

    pub fn msg(message: impl Into<String>) -> Self {
        Self::new(message, "ERROR")
    }
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ApiError {}

impl From<String> for ApiError {
    fn from(value: String) -> Self {
        Self::new(value, "ERROR")
    }
}

impl From<&str> for ApiError {
    fn from(value: &str) -> Self {
        Self::new(value, "ERROR")
    }
}

impl From<std::io::Error> for ApiError {
    fn from(value: std::io::Error) -> Self {
        Self::new(value.to_string(), "IO_ERROR")
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(value: anyhow::Error) -> Self {
        Self::new(value.to_string(), "ERROR")
    }
}

impl From<reqwest::Error> for ApiError {
    fn from(value: reqwest::Error) -> Self {
        Self::new(value.to_string(), "NETWORK_ERROR")
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(value: serde_json::Error) -> Self {
        Self::new(value.to_string(), "JSON_ERROR")
    }
}

impl From<zip::result::ZipError> for ApiError {
    fn from(value: zip::result::ZipError) -> Self {
        Self::new(value.to_string(), "ZIP_ERROR")
    }
}
