-- =============================================================================
-- BlankTex Module V1 — PostgreSQL Schema
-- Blank apparel catalog: Supplier → Brand → Style → Color/Size → SKU → Pricing
-- Target: PostgreSQL 13+ (uses gen_random_uuid from pgcrypto)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on every UPDATE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 1.1  suppliers
-- =============================================================================
CREATE TABLE suppliers (
    supplier_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_code         VARCHAR(20)   NOT NULL,
    supplier_name         VARCHAR(150)  NOT NULL,
    supplier_type         VARCHAR(30)   NOT NULL
        CHECK (supplier_type IN ('Distributor','Brand','Manufacturer','Wholesaler','Importer')),
    website               VARCHAR(255),
    api_available         BOOLEAN       NOT NULL DEFAULT FALSE,
    api_provider          VARCHAR(50),
    catalog_source        VARCHAR(30)   NOT NULL
        CHECK (catalog_source IN ('API','Excel Import','CSV Import','Manual Entry')),
    minimum_order         DECIMAL(10,2),
    free_shipping_amount  DECIMAL(10,2),
    default_currency      VARCHAR(10)   NOT NULL DEFAULT 'USD',
    payment_terms         VARCHAR(50),
    lead_time_days        INTEGER,
    supports_backorders   BOOLEAN       NOT NULL DEFAULT FALSE,
    dropship_available    BOOLEAN       NOT NULL DEFAULT FALSE,
    tax_exempt_supported  BOOLEAN       NOT NULL DEFAULT FALSE,
    default_status        VARCHAR(20)   NOT NULL DEFAULT 'Active'
        CHECK (default_status IN ('Active','Inactive')),
    remarks               TEXT,
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_suppliers_code UNIQUE (supplier_code)
);

CREATE INDEX ix_suppliers_name   ON suppliers (supplier_name);
CREATE INDEX ix_suppliers_type   ON suppliers (supplier_type);
CREATE INDEX ix_suppliers_status ON suppliers (default_status);

CREATE TRIGGER trg_suppliers_updated
    BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 1.2  supplier_contacts   (one supplier → many contacts)
-- =============================================================================
CREATE TABLE supplier_contacts (
    supplier_contact_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id               UUID          NOT NULL
        REFERENCES suppliers (supplier_id) ON DELETE RESTRICT,
    contact_name              VARCHAR(150)  NOT NULL,
    designation               VARCHAR(100),
    department                VARCHAR(100)
        CHECK (department IN ('Sales','Customer Service','Accounts','Purchasing',
                              'Returns','Technical','Management')),
    email                     VARCHAR(200),
    phone                     VARCHAR(50),
    mobile                    VARCHAR(50),
    whatsapp                  VARCHAR(50),
    extension                 VARCHAR(20),
    contact_type              VARCHAR(30)   NOT NULL
        CHECK (contact_type IN ('Sales','Customer Service','Accounts','Returns',
                                'Technical','API Support','Management')),
    is_primary                BOOLEAN       NOT NULL DEFAULT FALSE,
    receives_purchase_orders  BOOLEAN       NOT NULL DEFAULT FALSE,
    preferred_contact_method  VARCHAR(30)
        CHECK (preferred_contact_method IN ('Email','Phone','WhatsApp','Teams','Slack')),
    timezone                  VARCHAR(50),
    notes                     TEXT,
    status                    VARCHAR(20)   NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active','Inactive')),
    created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- email unique within a supplier (allows NULL emails)
    CONSTRAINT uq_contact_email_per_supplier UNIQUE (supplier_id, email)
);

CREATE INDEX ix_contacts_supplier ON supplier_contacts (supplier_id);
CREATE INDEX ix_contacts_name     ON supplier_contacts (contact_name);
CREATE INDEX ix_contacts_email    ON supplier_contacts (email);
CREATE INDEX ix_contacts_type     ON supplier_contacts (contact_type);
CREATE INDEX ix_contacts_status   ON supplier_contacts (status);

-- Business rule: only one primary contact per supplier
CREATE UNIQUE INDEX uq_contact_primary_per_supplier
    ON supplier_contacts (supplier_id)
    WHERE is_primary IS TRUE;

CREATE TRIGGER trg_contacts_updated
    BEFORE UPDATE ON supplier_contacts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 1.3  supplier_warehouses   (one supplier → many warehouses)
-- =============================================================================
CREATE TABLE supplier_warehouses (
    warehouse_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id            UUID          NOT NULL
        REFERENCES suppliers (supplier_id) ON DELETE RESTRICT,
    warehouse_code         VARCHAR(20)   NOT NULL,
    warehouse_name         VARCHAR(150)  NOT NULL,
    warehouse_type         VARCHAR(30)   NOT NULL
        CHECK (warehouse_type IN ('Distribution Center','Regional Warehouse',
                                  'Factory','Pickup','Cross Dock')),
    address_line1          VARCHAR(200)  NOT NULL,
    address_line2          VARCHAR(200),
    city                   VARCHAR(100)  NOT NULL,
    state                  VARCHAR(100)  NOT NULL,
    postal_code            VARCHAR(20)   NOT NULL,
    country                VARCHAR(100)  NOT NULL,
    timezone               VARCHAR(50),
    contact_name           VARCHAR(150),
    phone                  VARCHAR(50),
    email                  VARCHAR(200),
    latitude               DECIMAL(10,7),
    longitude              DECIMAL(10,7),
    shipping_cutoff_time   TIME,
    average_dispatch_days  INTEGER       NOT NULL DEFAULT 1,
    supports_pickup        BOOLEAN       NOT NULL DEFAULT FALSE,
    default_warehouse      BOOLEAN       NOT NULL DEFAULT FALSE,
    api_warehouse_code     VARCHAR(50),
    status                 VARCHAR(20)   NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active','Inactive','Closed')),
    remarks                TEXT,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- warehouse_code unique within a supplier
    CONSTRAINT uq_warehouse_code_per_supplier UNIQUE (supplier_id, warehouse_code),
    -- api_warehouse_code unique within a supplier (allows NULL)
    CONSTRAINT uq_warehouse_apicode_per_supplier UNIQUE (supplier_id, api_warehouse_code)
);

CREATE INDEX ix_warehouses_supplier ON supplier_warehouses (supplier_id);
CREATE INDEX ix_warehouses_state    ON supplier_warehouses (state);
CREATE INDEX ix_warehouses_city     ON supplier_warehouses (city);
CREATE INDEX ix_warehouses_status   ON supplier_warehouses (status);
CREATE INDEX ix_warehouses_apicode  ON supplier_warehouses (api_warehouse_code);

-- Business rule: only one default warehouse per supplier
CREATE UNIQUE INDEX uq_warehouse_default_per_supplier
    ON supplier_warehouses (supplier_id)
    WHERE default_warehouse IS TRUE;

CREATE TRIGGER trg_warehouses_updated
    BEFORE UPDATE ON supplier_warehouses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.1  brands   (one brand → many styles)
-- =============================================================================
CREATE TABLE brands (
    brand_id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_code           VARCHAR(20)   NOT NULL,
    brand_name           VARCHAR(150)  NOT NULL,
    brand_owner          VARCHAR(150),
    brand_logo           VARCHAR(255),
    website              VARCHAR(255),
    country_of_origin    VARCHAR(100),
    default_size_system  VARCHAR(20)   NOT NULL DEFAULT 'Adult'
        CHECK (default_size_system IN ('Adult','Youth','Toddler','Infant','Universal')),
    default_currency     VARCHAR(10)   NOT NULL DEFAULT 'USD',
    status               VARCHAR(20)   NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active','Inactive','Discontinued')),
    remarks              TEXT,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_brands_code UNIQUE (brand_code),
    CONSTRAINT uq_brands_name UNIQUE (brand_name)
);

CREATE INDEX ix_brands_status ON brands (status);

CREATE TRIGGER trg_brands_updated
    BEFORE UPDATE ON brands
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.2  styles   (one brand → many styles)
-- =============================================================================
CREATE TABLE styles (
    style_id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             UUID          NOT NULL
        REFERENCES brands (brand_id) ON DELETE RESTRICT,
    style_no             VARCHAR(50)   NOT NULL,
    style_name           VARCHAR(200)  NOT NULL,
    short_name           VARCHAR(100),
    garment_category     VARCHAR(50)   NOT NULL,
    garment_type         VARCHAR(50)   NOT NULL,
    gender               VARCHAR(30)   NOT NULL
        CHECK (gender IN ('Men','Women','Youth','Toddler','Infant','Unisex')),
    fit_type             VARCHAR(30),
    sleeve_type          VARCHAR(30),
    neck_type            VARCHAR(30),
    fabric_composition   VARCHAR(200),
    fabric_weight_gsm    DECIMAL(6,2),
    fabric_weight_oz     DECIMAL(6,2),
    fabric_type          VARCHAR(50),
    product_status       VARCHAR(30)   NOT NULL DEFAULT 'Active'
        CHECK (product_status IN ('Active','Discontinued','Coming Soon')),
    display_order        INTEGER       NOT NULL DEFAULT 0,
    is_featured          BOOLEAN       NOT NULL DEFAULT FALSE,
    default_supplier_id  UUID
        REFERENCES suppliers (supplier_id) ON DELETE SET NULL,
    active               BOOLEAN       NOT NULL DEFAULT TRUE,
    discontinued         BOOLEAN       NOT NULL DEFAULT FALSE,
    remarks              TEXT,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- style_no unique within a brand
    CONSTRAINT uq_style_no_per_brand UNIQUE (brand_id, style_no)
);

CREATE INDEX ix_styles_category   ON styles (garment_category);
CREATE INDEX ix_styles_gender     ON styles (gender);
CREATE INDEX ix_styles_active     ON styles (active);
CREATE INDEX ix_styles_discont    ON styles (discontinued);
CREATE INDEX ix_styles_gsm        ON styles (fabric_weight_gsm);
CREATE INDEX ix_styles_def_supp   ON styles (default_supplier_id);

CREATE TRIGGER trg_styles_updated
    BEFORE UPDATE ON styles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.3  style_colors   (one style → many colors)
-- =============================================================================
CREATE TABLE style_colors (
    style_color_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id             UUID          NOT NULL
        REFERENCES styles (style_id) ON DELETE RESTRICT,
    supplier_color_code  VARCHAR(50),
    color_name           VARCHAR(100)  NOT NULL,
    internal_color_code  VARCHAR(30)   NOT NULL,
    display_name         VARCHAR(100)  NOT NULL,
    hex_color            CHAR(7)
        CHECK (hex_color IS NULL OR hex_color ~ '^#[0-9A-Fa-f]{6}$'),
    pantone_code         VARCHAR(30),
    color_family         VARCHAR(50),
    sort_order           INTEGER       NOT NULL DEFAULT 0,
    is_popular           BOOLEAN       NOT NULL DEFAULT FALSE,
    is_default           BOOLEAN       NOT NULL DEFAULT FALSE,
    active               BOOLEAN       NOT NULL DEFAULT TRUE,
    discontinued         BOOLEAN       NOT NULL DEFAULT FALSE,
    remarks              TEXT,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- supplier_color_code unique within a style (allows NULL)
    CONSTRAINT uq_color_suppliercode_per_style UNIQUE (style_id, supplier_color_code)
);

CREATE INDEX ix_colors_style     ON style_colors (style_id);
CREATE INDEX ix_colors_internal  ON style_colors (internal_color_code);
CREATE INDEX ix_colors_family    ON style_colors (color_family);
CREATE INDEX ix_colors_active    ON style_colors (active);
CREATE INDEX ix_colors_popular   ON style_colors (is_popular);

-- Business rule: only one default color per style
CREATE UNIQUE INDEX uq_color_default_per_style
    ON style_colors (style_id)
    WHERE is_default IS TRUE;

CREATE TRIGGER trg_colors_updated
    BEFORE UPDATE ON style_colors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.4  style_sizes   (one style → many sizes)
-- =============================================================================
CREATE TABLE style_sizes (
    style_size_id       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id            UUID          NOT NULL
        REFERENCES styles (style_id) ON DELETE RESTRICT,
    size_code           VARCHAR(20)   NOT NULL,
    supplier_size_code  VARCHAR(30),
    size_name           VARCHAR(50)   NOT NULL,
    size_group          VARCHAR(30)   NOT NULL
        CHECK (size_group IN ('Adult','Youth','Toddler','Infant','Universal')),
    display_order       INTEGER       NOT NULL DEFAULT 0,
    is_default          BOOLEAN       NOT NULL DEFAULT FALSE,
    active              BOOLEAN       NOT NULL DEFAULT TRUE,
    discontinued        BOOLEAN       NOT NULL DEFAULT FALSE,
    remarks             TEXT,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- size_code unique within a style
    CONSTRAINT uq_size_code_per_style UNIQUE (style_id, size_code)
);

CREATE INDEX ix_sizes_style   ON style_sizes (style_id);
CREATE INDEX ix_sizes_group   ON style_sizes (size_group);
CREATE INDEX ix_sizes_active  ON style_sizes (active);
CREATE INDEX ix_sizes_order   ON style_sizes (display_order);

-- Business rule: only one default size per style
CREATE UNIQUE INDEX uq_size_default_per_style
    ON style_sizes (style_id)
    WHERE is_default IS TRUE;

CREATE TRIGGER trg_sizes_updated
    BEFORE UPDATE ON style_sizes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.4b style_size_specs   (one style_size → one spec)  garment + print dims
-- =============================================================================
CREATE TABLE style_size_specs (
    size_spec_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    style_size_id          UUID          NOT NULL
        REFERENCES style_sizes (style_size_id) ON DELETE CASCADE,
    chest_width            DECIMAL(6,2),
    body_length            DECIMAL(6,2),
    sleeve_length          DECIMAL(6,2),
    shoulder_width         DECIMAL(6,2),
    garment_weight_g       DECIMAL(6,2),
    print_area_width       DECIMAL(6,2),
    print_area_height      DECIMAL(6,2),
    max_print_width        DECIMAL(6,2),
    max_print_height       DECIMAL(6,2),
    front_print_top_margin DECIMAL(5,2),
    back_print_top_margin  DECIMAL(5,2),
    printable_area_json    JSONB,
    is_available           BOOLEAN       NOT NULL DEFAULT TRUE,
    is_discontinued        BOOLEAN       NOT NULL DEFAULT FALSE,
    notes                  TEXT,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    -- one spec per size
    CONSTRAINT uq_spec_per_size UNIQUE (style_size_id)
);

CREATE TRIGGER trg_specs_updated
    BEFORE UPDATE ON style_size_specs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.5  style_color_sizes   (SKU master: Style + Color + Size)
-- =============================================================================
CREATE TABLE style_color_sizes (
    sku_id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id          UUID          NOT NULL
        REFERENCES styles (style_id) ON DELETE RESTRICT,
    style_color_id    UUID          NOT NULL
        REFERENCES style_colors (style_color_id) ON DELETE RESTRICT,
    style_size_id     UUID          NOT NULL
        REFERENCES style_sizes (style_size_id) ON DELETE RESTRICT,
    sku_code          VARCHAR(100)  NOT NULL,
    supplier_sku      VARCHAR(100),
    supplier_style_no VARCHAR(50),
    barcode           VARCHAR(100),
    weight_lbs        DECIMAL(8,3),
    active            BOOLEAN       NOT NULL DEFAULT TRUE,
    discontinued      BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sku_code UNIQUE (sku_code),
    -- no duplicate Style + Color + Size combination
    CONSTRAINT uq_sku_style_color_size UNIQUE (style_id, style_color_id, style_size_id)
);

CREATE INDEX ix_sku_supplier_sku ON style_color_sizes (supplier_sku);
CREATE INDEX ix_sku_active       ON style_color_sizes (active);
CREATE INDEX ix_sku_discont      ON style_color_sizes (discontinued);
CREATE INDEX ix_sku_color        ON style_color_sizes (style_color_id);
CREATE INDEX ix_sku_size         ON style_color_sizes (style_size_id);

CREATE TRIGGER trg_sku_updated
    BEFORE UPDATE ON style_color_sizes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 3.1  supplier_sku_prices   (one SKU → many supplier prices)
-- =============================================================================
CREATE TABLE supplier_sku_prices (
    supplier_price_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id            UUID          NOT NULL
        REFERENCES suppliers (supplier_id) ON DELETE RESTRICT,
    warehouse_id           UUID
        REFERENCES supplier_warehouses (warehouse_id) ON DELETE SET NULL,
    sku_id                 UUID          NOT NULL
        REFERENCES style_color_sizes (sku_id) ON DELETE RESTRICT,
    cost_price             DECIMAL(10,2) NOT NULL,
    currency               VARCHAR(10)   NOT NULL DEFAULT 'USD',
    minimum_order_qty      INTEGER       NOT NULL DEFAULT 1,
    case_pack_qty          INTEGER,
    lead_time_days         INTEGER,
    free_shipping_eligible BOOLEAN       NOT NULL DEFAULT FALSE,
    preferred_supplier     BOOLEAN       NOT NULL DEFAULT FALSE,
    effective_from         DATE          NOT NULL DEFAULT CURRENT_DATE,
    effective_to           DATE,
    active                 BOOLEAN       NOT NULL DEFAULT TRUE,
    remarks                TEXT,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_price_effective_range
        CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX ix_price_supplier  ON supplier_sku_prices (supplier_id);
CREATE INDEX ix_price_warehouse ON supplier_sku_prices (warehouse_id);
CREATE INDEX ix_price_sku       ON supplier_sku_prices (sku_id);
CREATE INDEX ix_price_active    ON supplier_sku_prices (active);

-- Business rule: only one preferred supplier per SKU (among active prices)
CREATE UNIQUE INDEX uq_price_preferred_per_sku
    ON supplier_sku_prices (sku_id)
    WHERE preferred_supplier IS TRUE AND active IS TRUE;

CREATE TRIGGER trg_price_updated
    BEFORE UPDATE ON supplier_sku_prices
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.6  style_images   (one style -> many images; additive, added later)
-- =============================================================================
CREATE TABLE style_images (
    style_image_id  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id        UUID          NOT NULL
        REFERENCES styles (style_id) ON DELETE CASCADE,
    image_url       VARCHAR(500)  NOT NULL,   -- Nextcloud share link / any public image URL
    alt_text        VARCHAR(200),             -- e.g. "Front", "Back", color name
    is_primary      BOOLEAN       NOT NULL DEFAULT FALSE,
    sort_order      INTEGER       NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_style_images_style ON style_images (style_id);
-- Only one primary image per style
CREATE UNIQUE INDEX uq_style_image_primary ON style_images (style_id) WHERE is_primary IS TRUE;

CREATE TRIGGER trg_style_images_updated
    BEFORE UPDATE ON style_images
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- 2.7  manufacturers   (one manufacturer -> many brands; additive)
-- =============================================================================
CREATE TABLE manufacturers (
    manufacturer_id    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    manufacturer_code  VARCHAR(20),
    manufacturer_name  VARCHAR(150)  NOT NULL,
    country            VARCHAR(100),
    website            VARCHAR(255),
    status             VARCHAR(20)   NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active','Inactive')),
    remarks            TEXT,
    created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_manufacturer_code UNIQUE (manufacturer_code),
    CONSTRAINT uq_manufacturer_name UNIQUE (manufacturer_name)
);

CREATE TRIGGER trg_manufacturers_updated
    BEFORE UPDATE ON manufacturers
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Link brands to their manufacturer (nullable — a brand may have no manufacturer set)
ALTER TABLE brands ADD COLUMN manufacturer_id UUID
    REFERENCES manufacturers (manufacturer_id) ON DELETE SET NULL;
CREATE INDEX ix_brands_manufacturer ON brands (manufacturer_id);

-- =============================================================================
-- End of BlankTex Module V1 schema
-- =============================================================================
