// 文章與回應的共用型別，首頁與閱讀頁共用
export interface Post {
  id: number;
  title: string;
  scripture: string;
  category: string;
  content: string;
  post_date: string;
  like_count: number;
  dislike_count: number;
  comment_count: number;
  views: number;
  image_url: string | null;
  is_pinned: boolean;
}

// 讀者可見的已審核回應（私密、待審、駁回者由後端過濾，不會送來）
export interface PublicComment {
  id: number;
  user_name: string;
  salutation: string;
  comment_text: string;
  created_at: string;
  admin_reply: string | null;
  replied_at: string | null;
}
