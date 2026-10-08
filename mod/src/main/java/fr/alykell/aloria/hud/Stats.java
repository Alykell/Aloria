package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

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

	/** Le Reach affiché s'efface après 10 s sans coup */
	public static final long REACH_MEMORY_MS = 10_000;

	private Stats() {
	}

	/** Appelé par MouseHandlerMixin à chaque clic en jeu (boutons SDL : 1 = gauche, 3 = droit). */
	public static void onClick(int button) {
		long now = System.currentTimeMillis();
		if (button == InputConstants.MOUSE_BUTTON_LEFT) LEFT_CLICKS.addLast(now);
		else if (button == InputConstants.MOUSE_BUTTON_RIGHT) RIGHT_CLICKS.addLast(now);
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
	 * au point le plus proche de sa boîte de collision. Appelé à chaque coup porté (AttackEntityCallback).
	 */
	public static void onAttack(Player player, Entity target) {
		Vec3 eye = player.getEyePosition();
		Vec3 point;
		if (Minecraft.getInstance().hitResult instanceof EntityHitResult hit && hit.getEntity() == target) {
			point = hit.getLocation();
		} else {
			AABB box = target.getBoundingBox();
			point = new Vec3(Mth.clamp(eye.x, box.minX, box.maxX), Mth.clamp(eye.y, box.minY, box.maxY), Mth.clamp(eye.z, box.minZ, box.maxZ));
		}
		reach = eye.distanceTo(point);
		reachTime = System.currentTimeMillis();
	}

	/** Distance du dernier coup en blocs, ou -1 si aucun coup depuis REACH_MEMORY_MS */
	public static double reach() {
		return reach >= 0 && System.currentTimeMillis() - reachTime <= REACH_MEMORY_MS ? reach : -1;
	}

	public static void tick(Minecraft mc) {
		LocalPlayer player = mc.player;
		if (player == null) {
			lastX = Double.NaN;
			speed = 0;
			return;
		}
		if (!Double.isNaN(lastX)) {
			double dx = player.getX() - lastX;
			double dz = player.getZ() - lastZ;
			double instant = Math.sqrt(dx * dx + dz * dz) * 20;
			speed = speed * 0.6 + instant * 0.4;
		}
		lastX = player.getX();
		lastZ = player.getZ();
	}
}
