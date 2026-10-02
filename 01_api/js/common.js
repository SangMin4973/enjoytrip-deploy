/**
 * 특정 select의 option 내용을 업데이트 하는 함수
 * @param {HTMLSelectElement} select - 옵션을 변경할 대상 요소
 * @param {Array<{key:string, label:string}>} data - option을 구성할 배열
 */

export const updateSelect = (select, data) => {
  const type = select.dataset.type;
  select.innerHTML = `<option value="" selected disabled>${type} 선택</option>`;
  select.disabled = !data;
  if (data) {
    data.forEach((element) => {
      select.innerHTML += `<option value="${element.key || element.code}">${element.label || element.name}</option>`;
    });
  }
};

/**
 * url에 get 방식의 fetch 요청을 하고 결과를 Promise로 반환한다.
 * @async
 * @param {string} url - fetch 대상 url
 * @param {Object} param - URLSearchParams를 구성할 데이터들
 * @param {boolean} isXml - 서버의 응답이 xml인지 판단 여부
 * @returns {Promise<string|Object>} - isXml==true인 경우 String을 담은 Promise, 아니면 JSON 객체를 담은 Promise
 * @throws {Error} - 네트워크 오류 또는 응답 처리 중 오류 발생 시
 */
export const getFetch = async (url, param, isXml) => {
  try {
    const queryString = new URLSearchParams(param).toString();
    const response = await fetch(url + "?" + queryString);
    let result = "";
    if (isXml) {
      result = await response.text();
    } else {
      result = await response.json();
    }
    //console.log("요청 URL: " + url, param, result);
    return result;
  } catch (e) {
    console.log(e);
    throw e;
  }
};
/**
 * select 요소를 전달하면 요소의 label을 반환한다.
 * @param {HTMLSelectElement} select - 대상 Select의 reference
 * @returns {string} - select의 label
 */
export const getLabel = (select) => select.selectedOptions[0].text;


