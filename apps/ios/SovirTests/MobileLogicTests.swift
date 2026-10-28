import XCTest
@testable import Sovir

final class MobileLogicTests: XCTestCase {
    private var defaults: UserDefaults!
    private let suite = "sovir.tests.\(UUID().uuidString)"

    override func setUp() {
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
    }

    func testRefusalDoesNotCreateAnAccountOrCallAService() {
        for kind in [GateKind.signIn, GateKind.register] {
            for door in Door.allCases {
                let result = refuse(kind, door)
                XCTAssertFalse(result.accountCreated)
                XCTAssertFalse(result.networkCalled)
                XCTAssertFalse(result.enteredShell)
                let text = result.message.lowercased()
                XCTAssertFalse(text.contains("proteg"))
                XCTAssertFalse(text.contains("cuenta creada"))
            }
        }
    }

    func testFieldsAreJudgedWithoutKeepingTheValue() {
        XCTAssertEqual(emailProblem("  "), "Falta el correo.")
        XCTAssertEqual(emailProblem("ada"), "El correo no tiene forma de dirección.")
        XCTAssertNil(emailProblem("ada@ejemplo.com"))
        XCTAssertEqual(secretProblem(""), "Falta la clave.")
        XCTAssertNil(secretProblem("secreto-local"))
    }

    func testALocalNoteIsNotALink() {
        XCTAssertEqual(pendingOf(false), .absent)
        XCTAssertEqual(pendingOf(true), .localNote)
        XCTAssertEqual(pendingLabel(.absent), "Sin enlace")
        XCTAssertEqual(pendingLabel(.localNote), "Pendiente en este dispositivo")
    }

    func testDeveloperSessionStaysOnTheDeviceWithoutAnAccount() {
        let session = Session(defaults: defaults)
        session.openDemo()
        XCTAssertTrue(session.demo)
        XCTAssertFalse(session.accountExists)
        session.toggle(.phone)
        XCTAssertEqual(session.pending, [.phone])
        XCTAssertEqual(Set(sources.map(\.id)), Set(SourceID.allCases))
    }
}
