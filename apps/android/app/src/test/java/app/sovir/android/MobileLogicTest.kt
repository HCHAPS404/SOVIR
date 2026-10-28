package app.sovir.android

import app.sovir.android.model.Door
import app.sovir.android.model.GateKind
import app.sovir.android.model.MemorySession
import app.sovir.android.model.Pending
import app.sovir.android.model.SourceId
import app.sovir.android.model.emailProblem
import app.sovir.android.model.pendingLabel
import app.sovir.android.model.pendingOf
import app.sovir.android.model.refuse
import app.sovir.android.model.secretProblem
import app.sovir.android.model.sources
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileLogicTest {
    @Test
    fun refusalDoesNotCreateAnAccountOrCallAService() {
        for (kind in GateKind.entries) {
            for (door in Door.entries) {
                val result = refuse(kind, door)
                assertFalse(result.accountCreated)
                assertFalse(result.networkCalled)
                assertFalse(result.enteredShell)
                val text = result.message.lowercase()
                assertFalse(text.contains("proteg"))
                assertFalse(text.contains("cuenta creada"))
            }
        }
    }

    @Test
    fun fieldsAreJudgedWithoutKeepingTheValue() {
        assertEquals("Falta el correo.", emailProblem("  "))
        assertEquals("El correo no tiene forma de dirección.", emailProblem("ada"))
        assertNull(emailProblem("ada@ejemplo.com"))
        assertEquals("Falta la clave.", secretProblem(""))
        assertNull(secretProblem("secreto-local"))
        assertFalse(secretProblem("secreto-local")?.contains("secreto-local") == true)
    }

    @Test
    fun aLocalNoteIsNotALink() {
        assertEquals(Pending.Absent, pendingOf(false))
        assertEquals(Pending.LocalNote, pendingOf(true))
        assertEquals("Sin enlace", pendingLabel(Pending.Absent))
        assertEquals("Pendiente en este teléfono", pendingLabel(Pending.LocalNote))
    }

    @Test
    fun developerSessionStaysOnTheDeviceWithoutAnAccount() = runBlocking {
        val session = MemorySession()
        assertTrue(session.setDemo(true))
        val state = session.state.first()
        assertTrue(state.demo)
        assertFalse(state.accountExists)
        assertTrue(session.togglePending(SourceId.Phone))
        assertEquals(setOf(SourceId.Phone), session.state.first().pending)
        assertTrue(sources.map { it.id }.containsAll(SourceId.entries.toList()))
    }
}
