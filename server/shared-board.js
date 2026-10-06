import { validatePost, validateComment, boardError } from '../js/board-schema.js';

const postDto = post => ({ ...post, date: post.created_at.slice(0, 10), authorId: post.author_id, comments: post.comments || [] });
function postId(value) {
  if (!/^\d+$/.test(value || '') || !Number.isSafeInteger(Number(value))) throw boardError('게시글 주소가 올바르지 않습니다.');
  return value;
}
export function createSharedBoard(db, auth) {
  async function find(id) {
    const [post] = await db.request('matzip_posts', { query: { index: `eq.${id}`, limit: '1' } });
    if (!post) throw boardError('게시글을 찾을 수 없습니다.', 404);
    return post;
  }
  async function route(url, request, input = {}) {
    const match = /^\/api\/board\/posts(?:\/(\d+)(?:\/comments(?:\/([a-f0-9-]{36}))?)?)?$/.exec(url.pathname);
    if (!match) throw boardError('없는 게시판 API입니다.', 404);
    const [, rawId, commentId] = match, id = rawId ? postId(rawId) : null;
    const commentPath = url.pathname.includes('/comments');
    if (request.method === 'GET' && !id) {
      const page = Number(url.searchParams.get('page') || 1), type = url.searchParams.get('type') || 'all', query = url.searchParams.get('q') || '';
      if (!Number.isInteger(page) || page < 1 || page > 100000 || !['all', 'review', 'bookmark'].includes(type) || query.length > 120) throw boardError('검색 조건이 올바르지 않습니다.');
      return db.request('rpc/matzip_board_list', { method: 'POST', body: { search_text: query.trim(), post_type: type, page_number: page } });
    }
    if (!id && request.method === 'POST') {
      const { user } = await auth.requireUser(request), values = validatePost(input);
      const [post] = await db.request('matzip_posts', { method: 'POST', body: { ...values, author_id: user.id, writer: user.name } });
      return postDto(post);
    }
    if (!id) throw boardError('지원하지 않는 요청입니다.', 405);
    const post = await find(id);
    if (request.method === 'GET' && !commentPath) {
      const comments = await db.request('matzip_comments', { query: { post_id: `eq.${id}`, order: 'created_at.asc', limit: '500' } });
      return postDto({ ...post, comments: comments.map(item => ({ ...item, authorId: item.author_id })) });
    }
    const { user } = await auth.requireUser(request);
    if (commentPath) {
      if (request.method === 'POST' && !commentId) {
        const [comment] = await db.request('matzip_comments', { method: 'POST', body: { post_id: Number(id), author_id: user.id, writer: user.name, content: validateComment(input.content) } });
        return { ...comment, authorId: comment.author_id };
      }
      if (request.method === 'DELETE' && commentId) {
        const removed = await db.request('matzip_comments', { method: 'DELETE', query: { id: `eq.${commentId}`, post_id: `eq.${id}`, author_id: `eq.${user.id}` } });
        if (!removed.length) throw boardError('본인이 작성한 댓글만 삭제할 수 있습니다.', 403);
        return { deleted: true };
      }
    } else {
      if (post.author_id !== user.id) throw boardError('본인이 작성한 글만 수정·삭제할 수 있습니다.', 403);
      if (request.method === 'PATCH') {
        const values = validatePost(input);
        const [updated] = await db.request('matzip_posts', { method: 'PATCH', query: { index: `eq.${id}`, author_id: `eq.${user.id}` }, body: { ...values, writer: user.name, updated_at: new Date().toISOString() } });
        if (!updated) throw boardError('수정할 게시글이 없습니다.', 404);
        return postDto(updated);
      }
      if (request.method === 'DELETE') {
        await db.request('matzip_posts', { method: 'DELETE', query: { index: `eq.${id}`, author_id: `eq.${user.id}` } });
        return { deleted: true };
      }
    }
    throw boardError('지원하지 않는 요청입니다.', 405);
  }
  return { route };
}
