-- Drop tables if they exist (CASCADE to handle foreign key constraints)
DROP TABLE IF EXISTS paper CASCADE;
DROP TABLE IF EXISTS researcher CASCADE;

-- Create researcher table
CREATE TABLE researcher (
    id         VARCHAR(36) PRIMARY KEY,
    university VARCHAR(255),
    name       VARCHAR(255),
    city       VARCHAR(255),
    country    VARCHAR(255),
    keywords   JSONB,
    created_at TIMESTAMP WITHOUT TIME ZONE,
    updated_at TIMESTAMP WITHOUT TIME ZONE
);

-- Create paper table
CREATE TABLE paper (
    id            VARCHAR(36) PRIMARY KEY,
    researcher_id VARCHAR(36),
    title         VARCHAR(255),
    abstract      TEXT,
    keywords      JSONB,
    published_at  TIMESTAMP WITHOUT TIME ZONE,
    created_at    TIMESTAMP WITHOUT TIME ZONE,
    updated_at    TIMESTAMP WITHOUT TIME ZONE,
    CONSTRAINT fk_paper_researcher
        FOREIGN KEY (researcher_id)
        REFERENCES researcher (id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

