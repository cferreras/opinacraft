/**
 * The identity behind the reviews.
 *
 * A review directory that publishes nothing about who runs it and how it moderates is, from the
 * outside, indistinguishable from a spam directory. This is the single place that names the person
 * responsible, so the about page, the blog bylines and the `BlogPosting.author` node cannot drift
 * apart.
 */
export const aboutPath = "/quienes-somos";

export const siteAuthor = {
  name: "Carlos Ferreras",
  role: "Responsable del proyecto",
  /** The byline links here; the schema `author.url` uses the same path. */
  path: aboutPath,
  email: "carlos@carlosferreras.com",
} as const;
