import fs from "fs";
import Link from "next/link";

const getPostMetadata = () => {
  const folder = "posts/";
  const files = fs.readdirSync(folder);
  const markdownPosts = files.filter((file) => file.endsWith("md"));
  const slugs = markdownPosts.map((files) => files.replace("md", ""));
  return slugs;
};


const HomePage = () => {
  const PostMetadata = getPostMetadata();
  const PostPreviews = PostMetadata.map((slug) => (
    <div>
      <Link href={"/posts/${slug}"}>
        <h2>{slug}</h2>
      </Link>
    </div>
  ));

  return <div>{PostPreviews}</div>;
};

export default HomePage;