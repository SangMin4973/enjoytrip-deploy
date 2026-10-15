/**
 * 직접 구현할 파일입니다. TODO 1~3의 본문만 작성하세요.
 * 각 throw 문을 지우고 본인의 코드를 넣으면 됩니다.
 * API·입출력·컴파일·실행 코드는 다른 파일에 준비되어 있습니다.
 */
public final class StableMergeSort {
    private StableMergeSort() { }

    // 실행 연결과 원본 복사만 준비되어 있습니다. 정렬은 아래 TODO에서 구현합니다.
    public static RestaurantCandidate[] sort(RestaurantCandidate[] input, SortMode mode) {
        RestaurantCandidate[] result = input.clone();
        RestaurantCandidate[] buffer = new RestaurantCandidate[input.length];
        mergeSort(result, buffer, 0, result.length, mode);
        return result;
    }

    /** 음수: a가 앞 / 양수: b가 앞 / 0: 동점. 규칙은 README에 있습니다. */
    public static int compare(RestaurantCandidate a, RestaurantCandidate b, SortMode mode) {
        // TODO 1: 평가 유효 여부와 mode에 따른 우선순위를 비교하세요.

        throw new UnsupportedOperationException("TODO 1: compare");
    }

    /** 정렬 범위는 left 이상 right 미만입니다. */
    private static void mergeSort(RestaurantCandidate[] items, RestaurantCandidate[] buffer,
            int left, int right, SortMode mode) {
        // TODO 2: 종료 조건, 범위 분할, 재귀 호출, 병합 호출을 작성하세요.

        throw new UnsupportedOperationException("TODO 2: mergeSort");
    }

    /** [left, mid), [mid, right) 두 범위를 병합하는 공간입니다. */
    private static void merge(RestaurantCandidate[] items, RestaurantCandidate[] buffer,
            int left, int mid, int right, SortMode mode) {
        // TODO 3: compare를 사용해 안정적으로 병합하세요.

        throw new UnsupportedOperationException("TODO 3: merge");
    }
}
