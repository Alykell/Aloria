package fr.alykell.aloria.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;

import java.util.ArrayDeque;

/** Mesures calculées par le mod : clics par seconde et vitesse de déplacement. */
public final class Stats {
	private static final ArrayDeque<Long> LEFT_CLICKS = new ArrayDeque<>();
	private static final ArrayDeque<Long> RIGHT_CLICKS = new ArrayDeque<>();

	private static double lastX = Double.NaN;
	private static double lastZ;
	private static double speed;

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
