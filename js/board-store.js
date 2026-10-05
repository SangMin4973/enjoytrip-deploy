const KEY = 'boards';

export function readPosts() {
  let posts;
  try { posts = JSON.parse(localStorage.getItem(KEY) ?? '[]'); }
  catch { throw new Error('게시글을 읽지 못했습니다. 브라우저 저장소 설정과 데이터 상태를 확인해 주세요.'); }
  if (!Array.isArray(posts) || posts.some(post => !post || !/^\d+$/.test(String(post.index))
    || !Number.isSafeInteger(Number(post.index)) || ['subject', 'writer', 'content'].some(key => typeof post[key] !== 'string'))
    || new Set(posts.map(post => String(post.index))).size !== posts.length) {
    throw new Error('게시글 저장 형식이 올바르지 않습니다. 기존 데이터는 변경하지 않았습니다.');
  }
  return posts;
}

function savePosts(posts) {
  try { localStorage.setItem(KEY, JSON.stringify(posts)); }
  catch { throw new Error('게시글을 저장하지 못했습니다. 브라우저 저장 공간과 설정을 확인해 주세요.'); }
}

function fields(input) {
  const values = {};
  for (const [key, label, limit] of [['subject', '제목', 120], ['writer', '작성자', 40], ['content', '내용', 10000]]) {
    const value = String(input[key] ?? '').trim();
    if (!value) throw new Error(`${label}${key === 'writer' ? '를' : '을'} 입력해 주세요.`);
    if (value.length > limit) throw new Error(`${label}${key === 'writer' ? '는' : '은'} ${limit.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`);
    values[key] = value;
  }
  return values;
}

export function findPost(index, { countView = false } = {}) {
  if (index === null || index === undefined || !/^\d+$/.test(String(index))) throw new Error('게시글 주소가 올바르지 않습니다. 목록에서 글을 다시 선택해 주세요.');
  const posts = readPosts();
  const post = posts.find(item => String(item.index) === String(index));
  if (!post) throw new Error('게시글을 찾을 수 없습니다. 삭제되었거나 존재하지 않는 글입니다.');
  if (countView) {
    const views = Number(post.views);
    post.views = (Number.isSafeInteger(views) && views >= 0 ? views : 0) + 1;
    savePosts(posts);
  }
  return post;
}

export function createPost(input) {
  const values = fields(input), posts = readPosts();
  const index = posts.reduce((max, post) => Math.max(max, Number(post.index)), -1) + 1;
  if (!Number.isSafeInteger(index)) throw new Error('더 이상 게시글 번호를 만들 수 없습니다.');
  const date = new Date();
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const post = { index, ...values, date: stamp, views: 0 };
  savePosts([...posts, post]);
  return post;
}

export function updatePost(index, input) {
  const values = fields(input), posts = readPosts();
  const post = posts.find(item => String(item.index) === String(index));
  if (!post) throw new Error('수정할 게시글이 없습니다. 목록을 다시 확인해 주세요.');
  Object.assign(post, values);
  savePosts(posts);
  return post;
}

export function deletePost(index) {
  const posts = readPosts();
  if (!posts.some(post => String(post.index) === String(index))) throw new Error('이미 삭제되었거나 존재하지 않는 글입니다.');
  savePosts(posts.filter(post => String(post.index) !== String(index)));
}
