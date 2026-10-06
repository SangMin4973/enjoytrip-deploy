export function boardError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw boardError(`${label}은 1~${max.toLocaleString('ko-KR')}자로 입력해 주세요.`);
  return value.trim();
}
function restaurant(value) {
  if (!value || !/^kakao-\d+$/.test(value.id)) throw boardError('실제 음식점을 선택해 주세요.');
  return { id: value.id, name: text(value.name, '가게 이름', 200), address: String(value.address || '').slice(0, 300) };
}
export function validatePost(input) {
  const result = { subject: text(input.subject, '제목', 120), content: text(input.content, '내용', 10000), type: input.type };
  if (input.type === 'review') {
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw boardError('별점은 1~5점으로 선택해 주세요.');
    result.rating = input.rating; result.restaurant = restaurant(input.restaurant); result.bookmark = null;
  } else if (input.type === 'bookmark') {
    if (!input.bookmark || !Array.isArray(input.bookmark.restaurants) || input.bookmark.restaurants.length < 1 || input.bookmark.restaurants.length > 100) throw boardError('실제 음식점 1~100곳이 담긴 북마크를 선택해 주세요.');
    const restaurants = [...new Map(input.bookmark.restaurants.map(restaurant).map(item => [item.id, item])).values()];
    result.bookmark = { name: text(input.bookmark.name, '북마크 이름', 40), restaurants };
    result.restaurant = null; result.rating = null;
  } else throw boardError('음식점 후기 또는 북마크 공유를 선택해 주세요.');
  return result;
}
export const validateComment = value => text(value, '댓글', 2000);
