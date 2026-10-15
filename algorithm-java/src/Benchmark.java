import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;
import java.util.Random;

/** 합성 데이터 전용 성능 측정. 데이터 생성·정답 검증은 측정 구간 밖에서 수행합니다. */
public final class Benchmark {
    private static final int WARMUP = 2, REPEATS = 5;
    private static volatile Object sink;

    public static void main(String[] args) {
        final SortMode mode = args.length == 0 ? SortMode.RATING_DESC : SortMode.valueOf(args[0]);
        if (mode == SortMode.RECOMMENDED) throw new IllegalArgumentException("현재 성능 측정은 완성된 별점순·평가 수순 대상입니다.");
        final Comparator<RestaurantCandidate> comparator = new Comparator<RestaurantCandidate>() {
            @Override public int compare(RestaurantCandidate a, RestaurantCandidate b) { return StableMergeSort.compare(a, b, mode); }
        };
        System.out.println("Java=" + System.getProperty("java.version") + ", VM=" + System.getProperty("java.vm.name"));
        System.out.println("seed=42, mode=" + mode + ", warmup=" + WARMUP + ", repeats=" + REPEATS + ", API calls=0");
        System.out.println("size\tshape\tcopy_median_ms\tsort_total_median_ms");
        for (int size : new int[] { 15, 45, 1000, 10000, 100000 }) {
            for (String shape : new String[] { "random", "ordered", "reversed", "ties" }) {
                Random random = new Random(42);
                RestaurantCandidate[] input = new RestaurantCandidate[size];
                for (int i = 0; i < size; i++) input[i] = new RestaurantCandidate("synthetic-" + i, "합성 " + i, "google",
                    "ties".equals(shape) ? 4.5 : 1.0 + random.nextInt(41) / 10.0, "ties".equals(shape) ? 100 : 1 + random.nextInt(10000), i);
                RestaurantCandidate[] reference = input.clone(); Arrays.sort(reference, comparator);
                if ("ordered".equals(shape)) input = reference.clone();
                if ("reversed".equals(shape)) for (int i = 0; i < size; i++) input[i] = reference[size - 1 - i];
                for (int repeat = 0; repeat < WARMUP; repeat++) sink = StableMergeSort.sort(input, mode);
                long[] copies = new long[REPEATS], sorts = new long[REPEATS];
                for (int repeat = 0; repeat < REPEATS; repeat++) {
                    long start = System.nanoTime(); sink = input.clone(); copies[repeat] = System.nanoTime() - start;
                    start = System.nanoTime(); RestaurantCandidate[] result = StableMergeSort.sort(input, mode); sorts[repeat] = System.nanoTime() - start;
                    if (!Arrays.equals(reference, result)) throw new AssertionError("정답 불일치: " + size + "/" + shape);
                    sink = result;
                }
                Arrays.sort(copies); Arrays.sort(sorts);
                System.out.printf(Locale.ROOT, "%d\t%s\t%.6f\t%.6f%n", size, shape, copies[REPEATS / 2] / 1e6, sorts[REPEATS / 2] / 1e6);
            }
        }
        System.out.println("sort_total은 원본 복사·버퍼 생성·병합 정렬을 포함합니다. copy는 별도 측정값이며 차감하지 않습니다.");
        System.out.println("생성·검증·API 대기 시간은 제외했습니다. 보조 배열은 O(n), 관측 힙 사용량은 측정하지 않았습니다.");
    }
}
