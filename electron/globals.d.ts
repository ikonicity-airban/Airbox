export {};

declare global {
  var db: any;
  var Anime_providers: any;
  var Manga_providers: any;
  var Movies_providers: any;
  var PORT: any;
  var win: any;
  var cloudflarebypass: any;

  namespace Express {
    interface Request {
      [key: string]: any;
    }
    interface Response {
      [key: string]: any;
    }
  }

  interface Object {
    [key: string]: any;
  }
}
