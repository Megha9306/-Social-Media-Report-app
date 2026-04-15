-- v3: Post type classification + uploader info
ALTER TABLE posts ADD COLUMN post_type_category TEXT
  CHECK(post_type_category IN ('own_post','collab','tagged','non_tagged'))
  DEFAULT NULL;
ALTER TABLE posts ADD COLUMN uploader_handle TEXT DEFAULT NULL;
ALTER TABLE posts ADD COLUMN uploader_followers INTEGER DEFAULT NULL;
