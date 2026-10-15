import java.util.Comparator;
import java.util.Objects;

/** Google 평가를 보정한 별도 점수로 순위를 계산합니다. 원본 장소는 변경하지 않습니다. */
public final class BayesianRanker {
    public static final double DEFAULT_PRIOR_MEAN = 4.0;
    public static final double DEFAULT_PRIOR_WEIGHT = 50.0;

    private BayesianRanker() { }

    public static RankedRestaurant[] rank(RestaurantCandidate[] input,
            double priorMean, double priorWeight) {
        Objects.requireNonNull(input, "입력 배열이 필요합니다.");
        validateParameters(priorMean, priorWeight);
        RankedRestaurant[] views = new RankedRestaurant[input.length];
        for (int i = 0; i < input.length; i++) {
            RestaurantCandidate item = Objects.requireNonNull(input[i], "음식점이 null입니다.");
            Double score = hasRating(item) ? score(item, priorMean, priorWeight) : null;
            if (score != null && (!Double.isFinite(score) || score < 1 || score > 5)) {
                throw new IllegalStateException("계산한 추천 점수는 유한한 1~5 범위여야 합니다.");
            }
            views[i] = new RankedRestaurant(item, score);
        }
        return StableMergeSort.sort(views, new Comparator<RankedRestaurant>() {
            @Override
            public int compare(RankedRestaurant a, RankedRestaurant b) {
                return BayesianRanker.compare(a, b);
            }
        });
    }

    /** (v*R + m*C)/(v+m)와 동치인 식으로 큰 m에서도 곱셈 오버플로를 피합니다. */
    public static double score(RestaurantCandidate restaurant,
            double priorMean, double priorWeight) {
        Objects.requireNonNull(restaurant, "음식점이 필요합니다.");
        validateParameters(priorMean, priorWeight);
        if (!hasRating(restaurant)) {
            throw new IllegalArgumentException("보정 점수에는 유효한 Google 별점과 양의 평가 개수가 필요합니다.");
        }
        double priorShare = priorWeight / (restaurant.userRatingCount + priorWeight);
        return restaurant.rating + (priorMean - restaurant.rating) * priorShare;
    }

    /** 음수: a가 앞 / 양수: b가 앞 / 0: 동점 */
    public static int compare(RankedRestaurant a, RankedRestaurant b) {
        Objects.requireNonNull(a, "비교할 추천 결과가 필요합니다.");
        Objects.requireNonNull(b, "비교할 추천 결과가 필요합니다.");
        Objects.requireNonNull(a.restaurant, "원본 음식점이 필요합니다.");
        Objects.requireNonNull(b.restaurant, "원본 음식점이 필요합니다.");
        validateView(a);
        validateView(b);
        boolean aHasScore = a.score != null, bHasScore = b.score != null;
        if (aHasScore != bHasScore) return aHasScore ? -1 : 1;
        if (!aHasScore) {
            return Integer.compare(a.restaurant.originalIndex, b.restaurant.originalIndex);
        }
        int comparison = Double.compare(b.score, a.score);
        if (comparison != 0) return comparison;
        return StableMergeSort.compare(a.restaurant, b.restaurant, SortMode.RATING_DESC);
    }

    public static boolean hasRating(RestaurantCandidate item) {
        return "google".equals(item.source) && item.rating != null && Double.isFinite(item.rating)
                && item.rating >= 1 && item.rating <= 5 && item.userRatingCount > 0;
    }

    private static void validateView(RankedRestaurant item) {
        if (item.score != null && (!Double.isFinite(item.score) || item.score < 1 || item.score > 5 || !hasRating(item.restaurant))) {
            throw new IllegalArgumentException("추천 점수는 유효한 평가와 유한한 1~5 범위가 필요합니다.");
        }
    }

    private static void validateParameters(double priorMean, double priorWeight) {
        if (!Double.isFinite(priorMean) || priorMean < 1 || priorMean > 5
                || !Double.isFinite(priorWeight) || priorWeight < 0) {
            throw new IllegalArgumentException("C는 1~5, m은 0 이상인 유한한 수여야 합니다.");
        }
    }
}
