export {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  resolveComment,
  getMentions,
  markMentionRead,
  markAllMentionsRead,
} from './actions';
export type {
  CommentActionResponse,
  CommentWithAuthor,
  CreateCommentInput,
  Comment,
} from './types';
