using my.bookshop as my from '../db/schema';

service CatalogService @(requires : 'authenticated-user') {
    @readonly
    entity Books as projection on my.Books;
}
