public final class StableMergeSort {
    private StableMergeSort() { }

    public static RestaurantCandidate[] sort(
            RestaurantCandidate[] input,
            SortMode mode
    ) {
        RestaurantCandidate[] result = input.clone();
        RestaurantCandidate[] buffer =
                new RestaurantCandidate[input.length];

        mergeSort(result, buffer, 0, result.length, mode);
        return result;
    }

    /** 음수: a가 앞 / 양수: b가 앞 / 0: 동점 */
    public static int compare(
            RestaurantCandidate a,
            RestaurantCandidate b,
            SortMode mode
    ) {
        boolean aValid =
                "google".equals(a.source)
                && a.rating != null
                && Double.isFinite(a.rating)
                && a.rating >= 1.0
                && a.rating <= 5.0
                && a.userRatingCount > 0;

        boolean bValid =
                "google".equals(b.source)
                && b.rating != null
                && Double.isFinite(b.rating)
                && b.rating >= 1.0
                && b.rating <= 5.0
                && b.userRatingCount > 0;

        // 유효한 평가가 있는 음식점을 먼저 배치
        if (aValid != bValid) {
            return aValid ? -1 : 1;
        }

        // 둘 다 평가가 없으면 최초 검색 순서 유지
        if (!aValid) {
            return Integer.compare(
                    a.originalIndex,
                    b.originalIndex
            );
        }

        int comparison;

        if (mode == SortMode.RATING_DESC) {
            // 별점 내림차순 → 평가 수 내림차순
            comparison = Double.compare(b.rating, a.rating);

            if (comparison != 0) {
                return comparison;
            }

            comparison = Long.compare(
                    b.userRatingCount,
                    a.userRatingCount
            );
        } else {
            // 평가 수 내림차순 → 별점 내림차순
            comparison = Long.compare(
                    b.userRatingCount,
                    a.userRatingCount
            );

            if (comparison != 0) {
                return comparison;
            }

            comparison = Double.compare(b.rating, a.rating);
        }

        if (comparison != 0) {
            return comparison;
        }

        return Integer.compare(
                a.originalIndex,
                b.originalIndex
        );
    }

    /** 정렬 범위: [left, right) */
    private static void mergeSort(
            RestaurantCandidate[] items,
            RestaurantCandidate[] buffer,
            int left,
            int right,
            SortMode mode
    ) {
        // 원소가 0개 또는 1개면 정렬 완료
        if (right - left <= 1) {
            return;
        }

        int mid = left + (right - left) / 2;

        mergeSort(items, buffer, left, mid, mode);
        mergeSort(items, buffer, mid, right, mode);

        merge(items, buffer, left, mid, right, mode);
    }

    /** [left, mid)와 [mid, right)를 병합 */
    private static void merge(
            RestaurantCandidate[] items,
            RestaurantCandidate[] buffer,
            int left,
            int mid,
            int right,
            SortMode mode
    ) {
        int i = left;
        int j = mid;
        int k = left;

        // 두 범위의 앞쪽 원소를 비교하며 버퍼에 저장
        while (i < mid && j < right) {
            // 동점이면 왼쪽을 먼저 선택해 안정성 유지
            if (compare(items[i], items[j], mode) <= 0) {
                buffer[k++] = items[i++];
            } else {
                buffer[k++] = items[j++];
            }
        }

        // 왼쪽 범위에 남은 원소
        while (i < mid) {
            buffer[k++] = items[i++];
        }

        // 오른쪽 범위에 남은 원소
        while (j < right) {
            buffer[k++] = items[j++];
        }

        // 병합 결과를 작업 배열에 반영
        for (int index = left; index < right; index++) {
            items[index] = buffer[index];
        }
    }
}