package fr.alykell.aloria.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.entity.Entity;
import net.minecraft.entity.player.PlayerEntity;
import net.minecraft.util.hit.BlockHitResult;
import net.minecraft.util.math.Box;
import net.minecraft.util.math.Vec3d;

import java.util.ArrayDeque;

/** Mesures calculées par le mod : clics par seconde, vitesse de déplacement et distance des coups (Reach). */
public final class Stats {
	private static final ArrayDeque<Long> LEFT_CLICKS = new ArrayDeque<>();
	private static final ArrayDeque<Long> RIGHT_CLICKS = new ArrayDeque<>();

	private static double lastX = Double.NaN;
	private static double lastZ;
	private static double speed;
	private static double reach = -1;
	private static long reachTime;

	private Stats() {
	}

	/** Appelé par KeyBindingMixin à chaque clic en jeu (codes 1.8.9 : -100 = gauche, -99 = droit). */
	public static void onClick(int keyCode) {
		long now = System.currentTimeMillis();
		if (keyCode == -100) LEFT_CLICKS.addLast(now);
		else if (keyCode == -99) RIGHT_CLICKS.addLast(now);
	}

	private static int cps(ArrayDeque<Long> clicks) {
		long limit = System.currentTimeMillis() - 1000;
		while (!clicks.isEmpty() && clicks.peekFirst() < limit) clicks.pollFirst();
		return clicks.size();
	}

	public static int leftCps() {
		return cps(LEFT_CLICKS);
	}

	public static int rightCps() {
		return cps(RIGHT_CLICKS);
	}

	/** Vitesse horizontale en blocs par seconde, lissée */
	public static double speed() {
		return speed;
	}

	/**
	 * Distance du dernier coup : des yeux au point visé sur la cible (le rayon du viseur), ou à défaut
	 * au point le plus proche de sa boîte de collision. Appelé par AttackMixin.
	 */
	public static void onAttack(PlayerEntity player, Entity target) {
		Vec3d eye = player.getCameraPosVec(1f);
		BlockHitResult hit = MinecraftClient.getInstance().result;
		Vec3d point = hit != null && hit.entity == target && hit.pos != null ? hit.pos : null;
		if (point == null) {
			Box box = target.getBoundingBox();
			point = new Vec3d(clamp(eye.x, box.minX, box.maxX), clamp(eye.y, box.minY, box.maxY), clamp(eye.z, box.minZ, box.maxZ));
		}
		reach = eye.distanceTo(point);
		reachTime = System.currentTimeMillis();
	}

	private static double clamp(double v, double min, double max) {
		return v < min ? min : v > max ? max : v;
	}

	/** Distance du dernier coup en blocs, ou -1 si aucun coup depuis REACH_MEMORY_MS */
	public static double reach() {
		return reach >= 0 && System.currentTimeMillis() - reachTime <= REACH_MEMORY_MS ? reach : -1;
	}

	/** Le Reach affiché s'efface après 10 s sans coup */
	public static final long REACH_MEMORY_MS = 10_000;

	public static void tick(MinecraftClient mc) {
		PlayerEntity player = mc.player;
		if (player == null) {
			lastX = Double.NaN;
			speed = 0;
			return;
		}
		if (!Double.isNaN(lastX)) {
			double dx = player.x - lastX;
			double dz = player.z - lastZ;
			double instant = Math.sqrt(dx * dx + dz * dz) * 20;
			speed = speed * 0.6 + instant * 0.4;
		}
		lastX = player.x;
		lastZ = player.z;
	}
}
