import java.util.Comparator;
import java.util.Objects;

/** 직접 작성할 부분: score()와 compare()의 TODO 두 곳입니다. */
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

    /** 유효한 평가에 대해 (v*R + m*C)/(v+m)를 계산하는 공간입니다. */
    public static double score(RestaurantCandidate restaurant,
            double priorMean, double priorWeight) {
        // TODO 1: 보정 추천 점수 계산. 정렬용 값은 반올림하지 마세요.

        throw new UnsupportedOperationException("BayesianRanker TODO 1: score");
    }

    /** 음수: a가 앞 / 양수: b가 앞 / 0: 동점 */
    public static int compare(RankedRestaurant a, RankedRestaurant b) {
        // TODO 2: 점수 보유 여부 → 보정 점수 → 원본 별점 → 평가 수 → 최초 순서.
        // 점수가 없는 장소도 지우지 않고 뒤에서 최초 순서를 유지하세요.

        throw new UnsupportedOperationException("BayesianRanker TODO 2: compare");
    }

    public static boolean hasRating(RestaurantCandidate item) {
        return "google".equals(item.source) && item.rating != null && Double.isFinite(item.rating)
                && item.rating >= 1 && item.rating <= 5 && item.userRatingCount > 0;
    }

    private static void validateParameters(double priorMean, double priorWeight) {
        if (!Double.isFinite(priorMean) || priorMean < 1 || priorMean > 5
                || !Double.isFinite(priorWeight) || priorWeight < 0) {
            throw new IllegalArgumentException("C는 1~5, m은 0 이상인 유한한 수여야 합니다.");
        }
    }
}
