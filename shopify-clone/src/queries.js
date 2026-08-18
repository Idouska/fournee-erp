/** Requêtes de lecture (utilisées sur la source pour l'export et sur les deux boutiques pour le contrôle). */

export const Q_SHOP = `
query Shop {
  shop {
    id name myshopifyDomain email contactEmail
    url
    primaryDomain { id host url }
    currencyCode
    weightUnit
    ianaTimezone
    billingAddress { address1 address2 city country countryCodeV2 province provinceCode zip phone }
    plan { displayName partnerDevelopment shopifyPlus }
    features { storefront }
  }
}`;

export const Q_LOCATIONS = `
query Locations($pageSize: Int!, $cursor: String) {
  locations(first: $pageSize, after: $cursor, includeInactive: false) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name isActive fulfillsOnlineOrders
      address { address1 address2 city country countryCode province provinceCode zip phone }
    }
  }
}`;

export const Q_PUBLICATIONS = `
query Publications($pageSize: Int!, $cursor: String) {
  publications(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id name supportsFuturePublishing }
  }
}`;

export const Q_PRODUCTS = `
query Products($pageSize: Int!, $cursor: String) {
  products(first: $pageSize, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title descriptionHtml vendor productType tags status templateSuffix
      requiresSellingPlan isGiftCard hasVariantsThatRequiresComponents
      createdAt publishedAt
      category { id fullName }
      seo { title description }
      options {
        id name position
        optionValues { id name swatch { color image { ... on MediaImage { image { url } } } } }
      }
      media(first: 50) {
        nodes {
          id alt mediaContentType
          ... on MediaImage { image { url width height } mimeType }
          ... on Video { originalSource { url } }
          ... on ExternalVideo { originUrl }
          ... on Model3d { originalSource { url } }
        }
      }
      metafields(first: 100) { nodes { namespace key type value } }
      resourcePublications(first: 20) { nodes { isPublished publishDate publication { id name } } }
      variants(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          id title sku barcode price compareAtPrice taxable taxCode position inventoryPolicy
          availableForSale
          selectedOptions { name value }
          media(first: 1) { nodes { ... on MediaImage { image { url } } } }
          metafields(first: 30) { nodes { namespace key type value } }
          inventoryItem {
            id sku tracked requiresShipping countryCodeOfOrigin provinceCodeOfOrigin harmonizedSystemCode
            measurement { weight { unit value } }
            unitCost { amount currencyCode }
            inventoryLevels(first: 20) {
              nodes { location { id name } quantities(names: ["available"]) { name quantity } }
            }
          }
        }
      }
    }
  }
}`;

export const Q_COLLECTIONS = `
query Collections($pageSize: Int!, $cursor: String) {
  collections(first: $pageSize, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title descriptionHtml sortOrder templateSuffix
      image { url altText }
      seo { title description }
      ruleSet { appliedDisjunctively rules { column relation condition } }
      metafields(first: 50) { nodes { namespace key type value } }
      resourcePublications(first: 20) { nodes { isPublished publication { id name } } }
      products(first: 250) { pageInfo { hasNextPage } nodes { id handle } }
    }
  }
}`;

export const Q_PAGES = `
query Pages($pageSize: Int!, $cursor: String) {
  pages(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title body isPublished publishedAt templateSuffix createdAt
      metafields(first: 50) { nodes { namespace key type value } }
    }
  }
}`;

export const Q_BLOGS = `
query Blogs($pageSize: Int!, $cursor: String) {
  blogs(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title templateSuffix commentPolicy tags
      metafields(first: 50) { nodes { namespace key type value } }
    }
  }
}`;

export const Q_ARTICLES = `
query Articles($pageSize: Int!, $cursor: String) {
  articles(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title body summary isPublished publishedAt templateSuffix tags
      author { name }
      blog { id handle }
      image { url altText }
      metafields(first: 50) { nodes { namespace key type value } }
    }
  }
}`;

export const Q_MENUS = `
query Menus($pageSize: Int!, $cursor: String) {
  menus(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title isDefault
      items {
        id title type url resourceId tags
        items {
          id title type url resourceId tags
          items { id title type url resourceId tags }
        }
      }
    }
  }
}`;

export const Q_FILES = `
query Files($pageSize: Int!, $cursor: String) {
  files(first: $pageSize, after: $cursor, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id alt createdAt fileStatus
      preview { image { url } }
      ... on MediaImage { mimeType image { url width height } }
      ... on GenericFile { url mimeType originalFileSize }
      ... on Video { originalSource { url mimeType } }
      ... on Model3d { originalSource { url } }
    }
  }
}`;

export const METAFIELD_OWNER_TYPES = [
  'PRODUCT',
  'PRODUCTVARIANT',
  'COLLECTION',
  'CUSTOMER',
  'ORDER',
  'PAGE',
  'BLOG',
  'ARTICLE',
  'SHOP',
  'LOCATION',
  'COMPANY',
  'DISCOUNT',
  'DRAFTORDER',
  'MARKET'
];

export const Q_METAFIELD_DEFINITIONS = `
query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $pageSize: Int!, $cursor: String) {
  metafieldDefinitions(first: $pageSize, after: $cursor, ownerType: $ownerType) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name namespace key description ownerType pinnedPosition
      type { name }
      validations { name value type }
      capabilities {
        adminFilterable { enabled }
        smartCollectionCondition { enabled }
      }
      access { admin storefront customerAccount }
    }
  }
}`;

export const Q_METAOBJECT_DEFINITIONS = `
query MetaobjectDefinitions($pageSize: Int!, $cursor: String) {
  metaobjectDefinitions(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id type name description displayNameKey
      access { admin storefront }
      capabilities {
        publishable { enabled }
        translatable { enabled }
        renderable { enabled data { metaTitleKey metaDescriptionKey } }
        onlineStore { enabled data { urlHandle canCreateRedirects } }
      }
      fieldDefinitions {
        key name description required
        type { name }
        validations { name value type }
      }
    }
  }
}`;

export const Q_METAOBJECTS = `
query Metaobjects($type: String!, $pageSize: Int!, $cursor: String) {
  metaobjects(type: $type, first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id type handle displayName
      capabilities { publishable { status } }
      fields { key type value }
    }
  }
}`;

export const Q_URL_REDIRECTS = `
query UrlRedirects($pageSize: Int!, $cursor: String) {
  urlRedirects(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id path target }
  }
}`;

export const Q_SHOP_POLICIES = `
query ShopPolicies {
  shop {
    shopPolicies { id type body url }
  }
}`;

export const Q_DELIVERY_PROFILES = `
query DeliveryProfiles($pageSize: Int!, $cursor: String) {
  deliveryProfiles(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name default
      profileLocationGroups {
        locationGroup { id locations(first: 20) { nodes { id name } } }
        locationGroupZones(first: 30) {
          nodes {
            zone { id name countries { id code { countryCode restOfWorld } provinces { code name } } }
            methodDefinitions(first: 30) {
              nodes {
                id name description active
                rateProvider {
                  ... on DeliveryRateDefinition { id price { amount currencyCode } }
                  ... on DeliveryParticipant { id fixedFee { amount currencyCode } percentageOfRateFee participantServices { active name } }
                }
                methodConditions {
                  id operator field
                  conditionCriteria {
                    ... on Weight { unit value }
                    ... on MoneyV2 { amount currencyCode }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`;

export const Q_MARKETS = `
query Markets($pageSize: Int!, $cursor: String) {
  markets(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id name handle enabled primary }
  }
}`;

export const Q_SHOP_LOCALES = `
query ShopLocales {
  shopLocales(published: false) { locale name primary published }
}`;

export const Q_CUSTOMERS = `
query Customers($pageSize: Int!, $cursor: String) {
  customers(first: $pageSize, after: $cursor, sortKey: ID) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id firstName lastName email phone note tags taxExempt taxExemptions locale createdAt
      addresses(first: 10) {
        address1 address2 city company country countryCodeV2 firstName lastName phone province provinceCode zip
      }
      defaultAddress { address1 zip }
      emailMarketingConsent { marketingState marketingOptInLevel consentUpdatedAt }
      smsMarketingConsent { marketingState marketingOptInLevel consentUpdatedAt consentCollectedFrom }
      metafields(first: 20) { nodes { namespace key type value } }
    }
  }
}`;

export const Q_COUNTS = `
query Counts {
  productsCount { count }
  collectionsCount { count }
  customersCount { count }
  ordersCount { count }
}`;

/** Requêtes « identifiants seuls » pour compter sans coût. */
export const Q_IDS = {
  products: `query($pageSize: Int!, $cursor: String){ products(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
  productVariants: `query($pageSize: Int!, $cursor: String){ productVariants(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id sku } } }`,
  collections: `query($pageSize: Int!, $cursor: String){ collections(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
  pages: `query($pageSize: Int!, $cursor: String){ pages(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
  blogs: `query($pageSize: Int!, $cursor: String){ blogs(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
  articles: `query($pageSize: Int!, $cursor: String){ articles(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
  menus: `query($pageSize: Int!, $cursor: String){ menus(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id handle } } }`,
  files: `query($pageSize: Int!, $cursor: String){ files(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id fileStatus preview{image{url}} ... on MediaImage { image{url} } ... on GenericFile { url } } } }`,
  urlRedirects: `query($pageSize: Int!, $cursor: String){ urlRedirects(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id path } } }`,
  customers: `query($pageSize: Int!, $cursor: String){ customers(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id email } } }`,
  metaobjectDefinitions: `query($pageSize: Int!, $cursor: String){ metaobjectDefinitions(first:$pageSize, after:$cursor){ pageInfo{hasNextPage endCursor} nodes{ id type } } }`
};
