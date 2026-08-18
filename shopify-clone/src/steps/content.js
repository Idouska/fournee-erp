import { fail, info, ok, progress, step, warn } from '../log.js';
import { cleanCdnUrl, compact } from '../util.js';
import { metafieldInputs } from './products.js';

const M_PAGE_CREATE = `
mutation PageCreate($page: PageCreateInput!) {
  pageCreate(page: $page) { page { id handle } userErrors { field message code } }
}`;
const M_PAGE_UPDATE = `
mutation PageUpdate($id: ID!, $page: PageUpdateInput!) {
  pageUpdate(id: $id, page: $page) { page { id handle } userErrors { field message code } }
}`;
const M_BLOG_CREATE = `
mutation BlogCreate($blog: BlogCreateInput!) {
  blogCreate(blog: $blog) { blog { id handle } userErrors { field message code } }
}`;
const M_BLOG_UPDATE = `
mutation BlogUpdate($id: ID!, $blog: BlogUpdateInput!) {
  blogUpdate(id: $id, blog: $blog) { blog { id handle } userErrors { field message code } }
}`;
const M_ARTICLE_CREATE = `
mutation ArticleCreate($article: ArticleCreateInput!) {
  articleCreate(article: $article) { article { id handle } userErrors { field message code } }
}`;
const M_ARTICLE_UPDATE = `
mutation ArticleUpdate($id: ID!, $article: ArticleUpdateInput!) {
  articleUpdate(id: $id, article: $article) { article { id handle } userErrors { field message code } }
}`;

const Q_DEST_PAGES = `
query DestPages($pageSize: Int!, $cursor: String) {
  pages(first: $pageSize, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id handle } }
}`;
const Q_DEST_BLOGS = `
query DestBlogs($pageSize: Int!, $cursor: String) {
  blogs(first: $pageSize, after: $cursor) { pageInfo { hasNextPage endCursor } nodes { id handle } }
}`;
const Q_DEST_ARTICLES = `
query DestArticles($pageSize: Int!, $cursor: String) {
  articles(first: $pageSize, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes { id handle blog { id handle } }
  }
}`;

export async function run(ctx) {
  step('6. Pages, blogs et articles');

  // --- Pages ---
  const pages = await ctx.source.get('pages');
  const destPages = await ctx.dst.collect(Q_DEST_PAGES, {}, (d) => d.pages, { pageSize: 100 });
  const destPageByHandle = new Map(destPages.map((p) => [p.handle, p]));
  let pagesCreated = 0;
  let pagesUpdated = 0;

  for (const [index, page] of pages.entries()) {
    const existing = destPageByHandle.get(page.handle);
    const input = compact({
      title: page.title,
      handle: page.handle,
      body: ctx.rewrite(page.body),
      isPublished: page.isPublished,
      publishDate: page.publishedAt || undefined,
      templateSuffix: page.templateSuffix || undefined,
      metafields: metafieldInputs(ctx, page.metafields?.nodes, { kind: 'page', handle: page.handle })
    });
    try {
      if (existing) {
        const pruned = await ctx.compat.prune('PageUpdateInput', input);
        await ctx.dst.mutate(M_PAGE_UPDATE, { id: existing.id, page: pruned }, 'pageUpdate');
        ctx.maps.set('pages', page.id, existing.id);
        pagesUpdated += 1;
      } else {
        const pruned = await ctx.compat.prune('PageCreateInput', input);
        const payload = await ctx.dst.mutate(M_PAGE_CREATE, { page: pruned }, 'pageCreate');
        if (payload?.page) ctx.maps.set('pages', page.id, payload.page.id);
        pagesCreated += 1;
      }
    } catch (err) {
      fail(`page ${page.handle} : ${err.message}`);
    }
    progress(index + 1, pages.length, 'pages');
  }
  await ctx.maps.save();
  ok(`${pagesCreated} page(s) créée(s), ${pagesUpdated} mise(s) à jour.`);

  // --- Blogs ---
  const blogs = await ctx.source.get('blogs');
  const destBlogs = await ctx.dst.collect(Q_DEST_BLOGS, {}, (d) => d.blogs, { pageSize: 100 });
  const destBlogByHandle = new Map(destBlogs.map((b) => [b.handle, b]));
  let blogsCreated = 0;
  let blogsUpdated = 0;

  for (const blog of blogs) {
    const existing = destBlogByHandle.get(blog.handle);
    const input = compact({
      title: blog.title,
      handle: blog.handle,
      templateSuffix: blog.templateSuffix || undefined,
      commentPolicy: blog.commentPolicy || undefined,
      metafields: metafieldInputs(ctx, blog.metafields?.nodes, { kind: 'blog', handle: blog.handle })
    });
    try {
      if (existing) {
        const pruned = await ctx.compat.prune('BlogUpdateInput', input);
        await ctx.dst.mutate(M_BLOG_UPDATE, { id: existing.id, blog: pruned }, 'blogUpdate');
        ctx.maps.set('blogs', blog.id, existing.id);
        destBlogByHandle.set(blog.handle, existing);
        blogsUpdated += 1;
      } else {
        const pruned = await ctx.compat.prune('BlogCreateInput', input);
        const payload = await ctx.dst.mutate(M_BLOG_CREATE, { blog: pruned }, 'blogCreate');
        if (payload?.blog) {
          ctx.maps.set('blogs', blog.id, payload.blog.id);
          destBlogByHandle.set(blog.handle, payload.blog);
        }
        blogsCreated += 1;
      }
    } catch (err) {
      fail(`blog ${blog.handle} : ${err.message}`);
    }
  }
  await ctx.maps.save();
  ok(`${blogsCreated} blog(s) créé(s), ${blogsUpdated} mis à jour.`);

  // --- Articles ---
  const articles = await ctx.source.get('articles');
  const destArticles = await ctx.dst.collect(Q_DEST_ARTICLES, {}, (d) => d.articles, { pageSize: 50 });
  const destArticleByKey = new Map(destArticles.map((a) => [`${a.blog?.handle}|${a.handle}`, a]));
  let articlesCreated = 0;
  let articlesUpdated = 0;
  let orphans = 0;

  for (const [index, article] of articles.entries()) {
    const destBlog = destBlogByHandle.get(article.blog?.handle);
    if (!destBlog) {
      orphans += 1;
      continue;
    }
    const existing = destArticleByKey.get(`${article.blog.handle}|${article.handle}`);
    const image = article.image?.url
      ? compact({ url: cleanCdnUrl(article.image.url), src: cleanCdnUrl(article.image.url), altText: article.image.altText })
      : undefined;
    const input = compact({
      blogId: destBlog.id,
      title: article.title,
      handle: article.handle,
      body: ctx.rewrite(article.body),
      summary: ctx.rewrite(article.summary),
      tags: article.tags,
      author: article.author?.name ? { name: article.author.name } : undefined,
      image,
      isPublished: article.isPublished,
      publishDate: article.publishedAt || undefined,
      templateSuffix: article.templateSuffix || undefined,
      metafields: metafieldInputs(ctx, article.metafields?.nodes, { kind: 'article', handle: article.handle })
    });
    try {
      if (existing) {
        const pruned = await ctx.compat.prune('ArticleUpdateInput', input);
        await ctx.dst.mutate(M_ARTICLE_UPDATE, { id: existing.id, article: pruned }, 'articleUpdate');
        ctx.maps.set('articles', article.id, existing.id);
        articlesUpdated += 1;
      } else {
        const pruned = await ctx.compat.prune('ArticleCreateInput', input);
        const payload = await ctx.dst.mutate(M_ARTICLE_CREATE, { article: pruned }, 'articleCreate');
        if (payload?.article) ctx.maps.set('articles', article.id, payload.article.id);
        articlesCreated += 1;
      }
    } catch (err) {
      fail(`article ${article.handle} : ${err.message}`);
    }
    progress(index + 1, articles.length, 'articles');
    if ((index + 1) % 20 === 0) await ctx.maps.save();
  }
  await ctx.maps.save();
  ok(`${articlesCreated} article(s) créé(s), ${articlesUpdated} mis à jour.`);
  if (orphans) warn(`${orphans} article(s) sans blog correspondant sur la destination.`);

  info(
    `Les auteurs d'articles sont repris tels quels ; Shopify peut les rattacher à un compte staff existant ou les garder en texte libre.`
  );

  ctx.report.content = {
    pages: { source: pages.length, created: pagesCreated, updated: pagesUpdated },
    blogs: { source: blogs.length, created: blogsCreated, updated: blogsUpdated },
    articles: { source: articles.length, created: articlesCreated, updated: articlesUpdated, orphans }
  };
}
