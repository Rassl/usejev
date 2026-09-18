import { SITE } from './site';

const abs = (path: string) => new URL(path, SITE.url).href;

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}

export function techArticle(a: {
  title: string;
  description: string;
  path: string;
  publishedAt: Date;
  updatedAt: Date;
  proficiency?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: a.title,
    description: a.description,
    url: abs(a.path),
    mainEntityOfPage: abs(a.path),
    image: abs(SITE.ogImage),
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    inLanguage: 'en',
    ...(a.proficiency ? { proficiencyLevel: a.proficiency } : {}),
    author: { '@type': 'Organization', name: SITE.shortName, url: SITE.url },
    publisher: { '@type': 'Organization', name: SITE.shortName, url: SITE.url },
  };
}

export function faqPage(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}
